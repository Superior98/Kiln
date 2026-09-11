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
    const projectName =
      typeof body.project?.name === "string" ? body.project.name : "Untitled Game";
    const projectType =
      body.project?.type === "3D" ? "3D" : "2D";
    const prompt = isBuild
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