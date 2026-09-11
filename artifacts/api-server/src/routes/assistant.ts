import { Router, type IRouter } from "express";

const router: IRouter = Router();
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODELS_ENDPOINT = "https://api.groq.com/openai/v1/models";
const MODEL_CACHE_TTL_MS = 5 * 60 * 1000;
const PREFERRED_MODELS = [
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "qwen/qwen3-32b",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "moonshotai/kimi-k2-instruct",
];

// Only some Groq models accept image input. If the user attaches a
// screenshot or upload, we route to this one regardless of the
// selected/preferred text model.
const VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

let modelCache: { model: string; expiresAt: number } | null = null;
let availableModelsCache: { models: string[]; expiresAt: number } | null = null;

async function listAvailableGroqModels(apiKey: string): Promise<string[]> {
  if (availableModelsCache && availableModelsCache.expiresAt > Date.now()) {
    return availableModelsCache.models;
  }
  const response = await fetch(GROQ_MODELS_ENDPOINT, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const data = (await response.json()) as { data?: Array<{ id?: string; active?: boolean }> };
  if (!response.ok) return PREFERRED_MODELS;
  const models = (data.data ?? [])
    .filter((item) => item.active !== false && typeof item.id === "string")
    .map((item) => item.id as string);
  availableModelsCache = { models, expiresAt: Date.now() + MODEL_CACHE_TTL_MS };
  return models;
}

async function resolveGroqModel(apiKey: string) {
  if (modelCache && modelCache.expiresAt > Date.now()) {
    return modelCache.model;
  }

  const response = await fetch(GROQ_MODELS_ENDPOINT, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const data = (await response.json()) as {
    error?: { message?: string } | string;
    data?: Array<{ id?: string; active?: boolean }>;
  };

  if (!response.ok) {
    const message =
      typeof data.error === "string"
        ? data.error
        : data.error?.message || `Groq models request failed with status ${response.status}`;
    throw new Error(message);
  }

  const available = (data.data ?? [])
    .filter((item) => item.active !== false && typeof item.id === "string")
    .map((item) => item.id as string);
  const model =
    PREFERRED_MODELS.find((candidate) => available.includes(candidate)) ??
    available.find((candidate) => /instruct|llama|gpt|qwen/i.test(candidate)) ??
    available[0];

  if (!model) {
    throw new Error("Groq returned no usable chat models for this key.");
  }

  modelCache = { model, expiresAt: Date.now() + MODEL_CACHE_TTL_MS };
  return model;
}

type AssistantRequest = {
  prompt?: unknown;
  temperature?: unknown;
  maxTokens?: unknown;
  mode?: unknown;
  project?: {
    name?: unknown;
    type?: unknown;
  };
  currentGame?: unknown;
  files?: unknown;
  model?: unknown;
  image?: unknown;
  /**
   * "schema" (default, omit for existing behavior) fills in the fixed
   * game.json shape via normalizeGameSpec/parseBuildReply, same as always.
   * "code" is the new mode: Ember writes a real game.js file, run inside
   * the sandboxed iframe from code-sandbox.tsx, instead of filling a fixed
   * set of fields. See parseCodeBuildReply below.
   */
  responseFormat?: unknown;
  /** Existing game.js content, for edits in "code" responseFormat. */
  currentCode?: unknown;
  /**
   * The project's current asset list (name + whether it's an image),
   * so Ember can reference real uploaded assets by name via
   * Kiln.assets["name"] instead of only drawing shapes. Only name and
   * isImage are needed here — actual image bytes never leave the
   * browser; see resolveImageAssetsToDataUrls in code-sandbox.tsx.
   */
  assets?: unknown;
};

type GroqUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  queue_time?: number;
  prompt_time?: number;
  completion_time?: number;
  total_time?: number;
};

type GroqMetrics = {
  clientElapsedTime: number;
  queueTime: number;
  promptTime: number;
  completionTime: number;
  totalTime: number;
  tokensPerSecond: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  rateLimits: {
    remainingRequests: string | null;
    remainingTokens: string | null;
    resetTokens: string | null;
    resetRequests: string | null;
  };
};

function readGroqMetrics(headers: Headers, usage: GroqUsage | null, clientElapsedTime: number): GroqMetrics {
  const promptTokens = usage?.prompt_tokens ?? 0;
  const completionTokens = usage?.completion_tokens ?? 0;
  const completionTime = usage?.completion_time ?? 0;
  return {
    clientElapsedTime,
    queueTime: usage?.queue_time ?? 0,
    promptTime: usage?.prompt_time ?? 0,
    completionTime,
    totalTime: usage?.total_time ?? 0,
    tokensPerSecond: completionTokens && completionTime > 0 ? completionTokens / completionTime : 0,
    promptTokens,
    completionTokens,
    totalTokens: usage?.total_tokens ?? promptTokens + completionTokens,
    rateLimits: {
      remainingRequests: headers.get("x-ratelimit-remaining-requests"),
      remainingTokens: headers.get("x-ratelimit-remaining-tokens"),
      resetTokens: headers.get("x-ratelimit-reset-tokens"),
      resetRequests: headers.get("x-ratelimit-reset-requests"),
    },
  };
}

const GAME_KINDS = new Set(["platformer", "topdown", "shooter", "runner", "explorer"]);

function colorOr(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9a-f]{3,8}$/i.test(value) ? value : fallback;
}

function numberOr(value: unknown, fallback: number, min = -10000, max = 10000) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(Math.max(value, min), max)
    : fallback;
}

function normalizeGameSpec(value: unknown, fallbackTitle: string) {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const playerInput =
    input.player && typeof input.player === "object"
      ? (input.player as Record<string, unknown>)
      : {};
  const normalizeItems = (items: unknown, defaults: Record<string, unknown>[]) =>
    Array.isArray(items)
      ? items.slice(0, 40).flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const source = item as Record<string, unknown>;
          return [{
            x: numberOr(source.x, 0, -2000, 2000),
            y: numberOr(source.y, 0, -2000, 2000),
            w: numberOr(source.w, defaults[0]?.w as number ?? 48, 4, 600),
            h: numberOr(source.h, defaults[0]?.h as number ?? 20, 4, 600),
            size: numberOr(source.size, defaults[0]?.size as number ?? 14, 3, 100),
            color: colorOr(source.color, defaults[0]?.color as string ?? "#f59e0b"),
            speed: numberOr(source.speed, defaults[0]?.speed as number ?? 0, -20, 20),
          }];
        })
      : defaults;

  return {
    title: typeof input.title === "string" && input.title.trim()
      ? input.title.trim().slice(0, 80)
      : fallbackTitle,
    kind: typeof input.kind === "string" && GAME_KINDS.has(input.kind)
      ? input.kind
      : "platformer",
    background: colorOr(input.background, "#0c0a09"),
    accent: colorOr(input.accent, "#f59e0b"),
    instructions: typeof input.instructions === "string"
      ? input.instructions.trim().slice(0, 180)
      : "Arrow keys or A/D to move. Space to jump.",
    player: {
      x: numberOr(playerInput.x, 120, 0, 960),
      y: numberOr(playerInput.y, 360, 0, 540),
      w: numberOr(playerInput.w, 28, 8, 100),
      h: numberOr(playerInput.h, 40, 8, 100),
      color: colorOr(playerInput.color, "#f59e0b"),
      speed: numberOr(playerInput.speed, 260, 20, 800),
      jump: numberOr(playerInput.jump, 480, 50, 1000),
    },
    platforms: normalizeItems(input.platforms, [
      { x: 0, y: 470, w: 960, h: 70, color: "#292524" },
      { x: 270, y: 365, w: 180, h: 22, color: "#57534e" },
      { x: 600, y: 285, w: 180, h: 22, color: "#57534e" },
    ]),
    enemies: normalizeItems(input.enemies, [
      { x: 520, y: 430, size: 18, color: "#ef4444", speed: 45 },
    ]),
    collectibles: normalizeItems(input.collectibles, [
      { x: 350, y: 325, size: 12, color: "#38bdf8" },
      { x: 680, y: 245, size: 12, color: "#38bdf8" },
    ]),
  };
}

function parseBuildReply(reply: string, fallbackTitle: string) {
  const withoutFence = reply
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(withoutFence.slice(start, end + 1)) as Record<string, unknown>;
    const game = normalizeGameSpec(parsed.game ?? parsed, fallbackTitle);
    if (!game) return null;
    return {
      summary: typeof parsed.summary === "string" ? parsed.summary.trim().slice(0, 500) : "",
      game,
    };
  } catch {
    return null;
  }
}

// --- "code" responseFormat: Ember writes real game.js, instead of filling
// the fixed game.json schema above. Additive and fully separate from the
// schema-mode functions above it — existing schema-mode requests are
// untouched by anything below. ---

const CODE_MODE_FILENAME_PATTERN = /^[a-zA-Z0-9_-]+\.js$/;
const MAX_CODE_FILE_LENGTH = 50_000;
const MAX_CODE_FILES = 1; // the sandbox harness runs one inline script; see code-sandbox.tsx

type CodeBuildFile = { path: string; content: string };
type CodeBuildResult = { summary: string; files: CodeBuildFile[] };

/**
 * Parse-only syntax check (never executes the code). This is a fast,
 * dependency-free way to reject a malformed generation server-side and
 * give the user a clean "try again" instead of silently applying broken
 * code that only fails once it hits the sandboxed iframe in the browser.
 * It is not a security boundary by itself — CodeSandbox's iframe
 * isolation (sandbox="allow-scripts", no allow-same-origin, strict CSP)
 * is what actually contains untrusted code once it runs; this check only
 * improves the failure mode for honest mistakes like a dropped brace.
 */
function checkJsSyntax(code: string): { ok: true } | { ok: false; message: string } {
  try {
    // eslint-disable-next-line no-new-func -- parse-only, never invoked.
    new Function(code);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

function parseCodeBuildReply(reply: string): CodeBuildResult | { error: string } {
  const withoutFence = reply
    .replace(/^```(?:js|javascript|json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return { error: "Ember's reply did not contain a JSON object." };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(withoutFence.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return { error: "Ember's reply was not valid JSON." };
  }

  const rawFiles = parsed.files;
  if (!Array.isArray(rawFiles) || rawFiles.length === 0) {
    return { error: "Ember's reply did not include any files." };
  }
  if (rawFiles.length > MAX_CODE_FILES) {
    return { error: `Ember returned ${rawFiles.length} files; only ${MAX_CODE_FILES} is supported right now.` };
  }

  const files: CodeBuildFile[] = [];
  for (const raw of rawFiles) {
    if (!raw || typeof raw !== "object") {
      return { error: "Ember returned a malformed file entry." };
    }
    const entry = raw as Record<string, unknown>;
    const path = entry.path;
    const content = entry.content;
    if (typeof path !== "string" || typeof content !== "string") {
      return { error: "Ember returned a file entry missing a path or content string." };
    }
    if (!CODE_MODE_FILENAME_PATTERN.test(path)) {
      return {
        error: `Ember returned an unsafe or unsupported file name: ${path}. Only a simple .js filename is allowed (no paths, no directory traversal).`,
      };
    }
    if (content.length > MAX_CODE_FILE_LENGTH) {
      return { error: `Ember returned an oversized file: ${path} (${content.length} chars, max ${MAX_CODE_FILE_LENGTH}).` };
    }
    const syntax = checkJsSyntax(content);
    if (!syntax.ok) {
      return { error: `Ember returned ${path} with a JavaScript syntax error: ${syntax.message}` };
    }
    files.push({ path, content });
  }

  return {
    summary: typeof parsed.summary === "string" ? parsed.summary.trim().slice(0, 500) : "",
    files,
  };
}

function buildCodeModePrompt(
  projectType: string,
  projectName: string,
  currentCode: unknown,
  userPrompt: string,
  assets: unknown,
): string {
  const assetLines = describeAssetsForPrompt(assets);
  return [
    "You are Ember, a game-building assistant that writes real, runnable JavaScript.",
    `Write or update the playable ${projectType} game "${projectName}" from the user's request.`,
    'Return ONLY valid JSON with this exact shape: {"summary":"short explanation","files":[{"path":"game.js","content":"..."}]}.',
    "Write exactly one file named game.js containing the complete game logic as plain JavaScript. No import, export, require, or bundler — it runs as a single inline <script>, not a module.",
    "The code runs inside a sandboxed iframe with no network access and no DOM besides one canvas. It can only use the global `Kiln` object:",
    "  Kiln.canvas, Kiln.ctx (a 2D canvas context), Kiln.width, Kiln.height - the drawing surface.",
    "  Kiln.isKeyDown(key) - true while a key is held, e.g. Kiln.isKeyDown('arrowleft') or Kiln.isKeyDown(' ') for space.",
    "  Kiln.onFrame(function(dt) { ... }) - register the per-frame update-and-draw callback; dt is seconds since the last frame. Clear and redraw the canvas yourself each frame.",
    "  Kiln.ready() - call once, after setup, to signal the game is ready. Required, or the preview shows a timeout error.",
    "  Kiln.win() / Kiln.lose() - call when the player reaches a win or lose condition. Each only fires once until Kiln.resetOutcome() is called, so it's safe to check the condition every frame.",
    "  Kiln.resetOutcome() - call when restarting the game so win()/lose() can fire again.",
    "  Kiln.setScore(number) - report the current score, if the game has one.",
    "  Kiln.log(...) - debug logging for the developer; not shown to the player.",
    "  Kiln.assets['exact-name'] - a real, already-loaded <img> element for an uploaded project asset, ready to draw immediately: Kiln.ctx.drawImage(Kiln.assets['exact-name'], x, y, w, h). Only listed asset names below exist; never invent or fetch an asset that isn't listed.",
    "Never use import, export, require, fetch, XMLHttpRequest, WebSocket, localStorage, sessionStorage, or cookies - none of them work in this sandbox and using them will fail at runtime.",
    "Preserve the existing game's logic when the user asks for an edit, and change only what the request calls for. You are given the current game.js below and must return the complete updated file, not a diff or a partial snippet.",
    `Available image assets (use the exact name as the Kiln.assets key): ${assetLines}`,
    `Current game.js:\n${typeof currentCode === "string" && currentCode.trim() ? currentCode : "(none yet - this is a new game)"}`,
    `User request: ${userPrompt.trim()}`,
  ].join("\n");
}

const MAX_ASSET_NAMES_IN_PROMPT = 30;
const MAX_ASSET_NAME_LENGTH = 120;

/**
 * Turns the client's asset list into a short, safe line for the prompt.
 * Only names and the isImage flag are ever used — actual image bytes
 * never reach this server or Groq; see the doc comment on
 * AssistantRequest.assets and resolveImageAssetsToDataUrls on the
 * client, which is what actually gets pixels into the sandbox.
 */
function describeAssetsForPrompt(assets: unknown): string {
  if (!Array.isArray(assets) || assets.length === 0) {
    return "(none uploaded yet - only draw shapes/text unless the user uploads an image asset)";
  }
  const names = assets
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
    .filter((entry) => entry.isImage === true && typeof entry.name === "string")
    .map((entry) => (entry.name as string).slice(0, MAX_ASSET_NAME_LENGTH))
    .slice(0, MAX_ASSET_NAMES_IN_PROMPT);
  if (names.length === 0) {
    return "(none uploaded yet - only draw shapes/text unless the user uploads an image asset)";
  }
  return names.map((name) => `"${name}"`).join(", ");
}

router.get("/assistant/models", async (req, res) => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "Groq is not configured on the server." });
    return;
  }
  try {
    const available = await listAvailableGroqModels(apiKey);
    const ranked = PREFERRED_MODELS.filter((m) => available.includes(m));
    const rest = available.filter((m) => !ranked.includes(m));
    res.json({
      models: [...ranked, ...rest].map((id, index) => ({ id, best: index === 0 })),
      visionModel: VISION_MODEL,
    });
  } catch (error) {
    req.log.error({ err: error }, "Failed to list Groq models");
    res.status(502).json({ error: "Unable to reach Groq right now." });
  }
});

router.post("/assistant", async (req, res) => {
  const body = req.body as AssistantRequest;

  if (typeof body.prompt !== "string" || body.prompt.trim().length === 0) {
    res.status(400).json({ error: "A non-empty prompt is required." });
    return;
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    res.status(503).json({
      error: "Groq is not configured on the server. Add GROQ_API_KEY to Secrets.",
    });
    return;
  }

  const temperature =
    typeof body.temperature === "number"
      ? Math.min(Math.max(body.temperature, 0), 2)
      : 0.7;
  const maxTokens =
    typeof body.maxTokens === "number"
      ? Math.min(Math.max(Math.floor(body.maxTokens), 1), 8192)
      : body.mode === "build" ? 3000 : 200;

  const hasImage = typeof body.image === "string" && body.image.startsWith("data:image/");
  const requestedModel = typeof body.model === "string" ? body.model : null;

  try {
    let model: string;
    if (hasImage) {
      // Vision requests always go to the vision-capable model, regardless
      // of what's selected in the picker — most Groq text models will
      // simply error out on image content.
      model = VISION_MODEL;
    } else if (requestedModel) {
      const available = await listAvailableGroqModels(apiKey);
      model = available.includes(requestedModel) ? requestedModel : await resolveGroqModel(apiKey);
    } else {
      model = await resolveGroqModel(apiKey);
    }
    const isBuild = body.mode === "build";
    const isCodeMode = isBuild && body.responseFormat === "code";
    const projectName =
      typeof body.project?.name === "string" ? body.project.name : "Untitled Game";
    const projectType =
      body.project?.type === "3D" ? "3D" : "2D";
    const prompt = isCodeMode
      ? buildCodeModePrompt(projectType, projectName, body.currentCode, body.prompt, body.assets)
      : isBuild
      ? [
          "You are Ember, a game-building assistant.",
          `Create or update the playable ${projectType} game "${projectName}" from the user's request.`,
          "Return ONLY valid JSON with this exact shape: {\"summary\":\"short explanation\",\"game\":{...}}.",
          "The game object must contain: title, kind, background, accent, instructions, player, platforms, enemies, collectibles.",
          "Allowed kind values: platformer, topdown, shooter, runner, explorer.",
          "Use a 960x540 world. Coordinates are pixels with y increasing downward.",
          "Make a complete playable scene, not a plan. Keep arrays concise (no more than 12 platforms, 10 enemies, 12 collectibles).",
          "Preserve the existing game idea when the user asks for an edit, and change only what the request calls for.",
          `Current game definition: ${JSON.stringify(body.currentGame ?? {})}`,
          `Current project files: ${Array.isArray(body.files) ? body.files.join(", ") : "game.json"}`,
          `User request: ${body.prompt.trim()}`,
        ].join("\n")
      : body.prompt.trim();
    const messageContent = hasImage
      ? [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: body.image as string } },
        ]
      : prompt;

    const requestStartedAt = Date.now();
    const upstream = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: messageContent }],
        temperature,
        max_tokens: maxTokens,
      }),
    });

    const data = (await upstream.json()) as {
      error?: { message?: string } | string;
      choices?: Array<{
        message?: {
          content?: string | Array<{ type?: string; text?: string }> | null;
          reasoning_content?: string | null;
          reasoning?: string | null;
        };
      }>;
      usage?: GroqUsage;
    };

    const clientElapsedTime = (Date.now() - requestStartedAt) / 1000;
    const metrics = readGroqMetrics(upstream.headers, data.usage ?? null, clientElapsedTime);

    if (!upstream.ok) {
      const message =
        typeof data.error === "string"
          ? data.error
          : data.error?.message || `Groq responded with status ${upstream.status}`;
      res.status(upstream.status === 429 ? 429 : 502).json({ error: message, model, metrics });
      return;
    }

    const message = data.choices?.[0]?.message;
    const reply =
      typeof message?.content === "string"
        ? message.content.trim()
        : Array.isArray(message?.content)
          ? message.content
              .map((part) => part.text ?? "")
              .join("")
              .trim()
          : (message?.reasoning_content ?? message?.reasoning)?.trim();
    if (!reply) {
      res.status(502).json({
        error: `Groq returned no text for model ${model}.`,
        model,
        metrics,
      });
      return;
    }

    if (isCodeMode) {
      const build = parseCodeBuildReply(reply);
      if ("error" in build) {
        res.status(502).json({ error: build.error, model, metrics });
        return;
      }
      res.json({
        reply: build.summary || "Updated the game code.",
        summary: build.summary || "Updated the game code.",
        responseFormat: "code",
        files: build.files,
        model,
        usage: data.usage ?? null,
        metrics,
      });
      return;
    }

    if (isBuild) {
      const build = parseBuildReply(reply, projectName);
      if (!build) {
        res.status(502).json({
          error: "Ember returned an invalid game definition. Try the request again.",
          model,
          metrics,
        });
        return;
      }
      res.json({
        reply: build.summary || `Built ${build.game.title}.`,
        summary: build.summary || `Built ${build.game.title}.`,
        game: build.game,
        responseFormat: "schema",
        files: [{
          path: "game.json",
          content: JSON.stringify(build.game, null, 2),
        }],
        model,
        usage: data.usage ?? null,
        metrics,
      });
      return;
    }

    res.json({ reply, model, usage: data.usage ?? null, metrics });
  } catch (error) {
    req.log.error({ err: error }, "Groq assistant request failed");
    res.status(502).json({ error: "Unable to reach Groq right now." });
  }
});

export default router;