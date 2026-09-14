import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { EMBER_PLANS, ensureBillingSession, getEmberPlan, type EmberPlanId } from "./billing";

const router: IRouter = Router();
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_REASONING_EFFORT = process.env.EMBER_AGENT_REASONING_EFFORT || "high";
const MAX_FILES = 32;
const MAX_FILE_SIZE = 60_000;
const MAX_PROJECT_CHARS = 500_000;
const SAFE_PATH = /^(?!.*(?:^|\/)\.\.(?:\/|$))(?!\/)(?![A-Za-z]:[\\/])[^\u0000]+$/;

type ProjectFile = { path: string; content: string };
type AgentOperation =
  | { type: "create" | "update"; path: string; content: string }
  | { type: "delete"; path: string }
  | { type: "rename"; from: string; path: string };
type AgentResult = { summary: string; operations: AgentOperation[] };

function allowedModels(plan: EmberPlanId): string[] {
  if (plan === "premium_plus") return [EMBER_PLANS.free.model, EMBER_PLANS.premium.model, EMBER_PLANS.premium_plus.model];
  if (plan === "premium") return [EMBER_PLANS.free.model, EMBER_PLANS.premium.model];
  return [EMBER_PLANS.free.model];
}

async function reserveDailyRequest(sessionId: string, plan: EmberPlanId): Promise<boolean> {
  const usageDate = new Date().toISOString().slice(0, 10);
  const limit = EMBER_PLANS[plan].dailyRequests;
  const result = await db.execute(sql`
    INSERT INTO kiln_model_usage_daily (id, user_id, usage_date, requests)
    VALUES (${crypto.randomUUID()}, ${sessionId}, ${usageDate}, 1)
    ON CONFLICT (user_id, usage_date)
    DO UPDATE SET requests = kiln_model_usage_daily.requests + 1, updated_at = now()
    WHERE kiln_model_usage_daily.requests < ${limit}
    RETURNING requests
  `);
  return Array.isArray(result) ? result.length > 0 : Boolean((result as { rows?: unknown[] }).rows?.length);
}

function checkJavaScriptSyntax(_code: string): string | null { return null; }
function safePath(path: string): boolean { return SAFE_PATH.test(path) && path.length <= 180 && !path.includes("\\"); }

function validateOperations(raw: unknown, existing: ProjectFile[]): AgentResult | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "Ember returned an invalid agent response." };
  const value = raw as Record<string, unknown>;
  const rawOperations = value.operations;
  if (!Array.isArray(rawOperations)) return { error: "Ember did not return project operations." };
  if (rawOperations.length > MAX_FILES) return { error: `Ember returned too many operations (max ${MAX_FILES}).` };
  const known = new Set(existing.map((file) => file.path));
  const operations: AgentOperation[] = [];
  for (const item of rawOperations) {
    if (!item || typeof item !== "object") return { error: "Ember returned a malformed operation." };
    const op = item as Record<string, unknown>;
    const type = op.type;
    if (type === "create" || type === "update") {
      const path = op.path; const content = op.content;
      if (typeof path !== "string" || typeof content !== "string") return { error: "File operation is missing path/content." };
      if (!safePath(path)) return { error: `Unsafe project path: ${path}` };
      if (content.length > MAX_FILE_SIZE) return { error: `${path} exceeds the ${MAX_FILE_SIZE}-character file limit.` };
      const lower = path.toLowerCase();
      if (lower.endsWith(".js") || lower.endsWith(".mjs") || lower.endsWith(".cjs")) {
        const syntaxError = checkJavaScriptSyntax(content);
        if (syntaxError) return { error: `${path} has a JavaScript syntax error: ${syntaxError}` };
      } else if (lower.endsWith(".json")) {
        try { JSON.parse(content); } catch (error) { return { error: `${path} has invalid JSON: ${error instanceof Error ? error.message : String(error)}` }; }
      }
      if (type === "create" && known.has(path)) return { error: `Ember tried to create an existing file: ${path}` };
      if (type === "update" && !known.has(path)) return { error: `Ember tried to update a missing file: ${path}` };
      known.add(path); operations.push({ type, path, content });
    } else if (type === "delete") {
      const path = op.path;
      if (typeof path !== "string" || !safePath(path)) return { error: "Ember returned an unsafe delete path." };
      if (!known.has(path)) return { error: `Ember tried to delete a missing file: ${path}` };
      known.delete(path); operations.push({ type: "delete", path });
    } else if (type === "rename") {
      const from = op.from; const path = op.path;
      if (typeof from !== "string" || typeof path !== "string" || !safePath(from) || !safePath(path)) return { error: "Ember returned an unsafe rename." };
      if (!known.has(from)) return { error: `Ember tried to rename a missing file: ${from}` };
      if (known.has(path)) return { error: `Ember tried to rename over an existing file: ${path}` };
      known.delete(from); known.add(path); operations.push({ type: "rename", from, path });
    } else return { error: `Unsupported Ember operation: ${String(type)}` };
  }
  return { summary: typeof value.summary === "string" ? value.summary.trim().slice(0, 600) : "Project updated.", operations };
}

function projectText(files: ProjectFile[]): string {
  let total = 0; const chunks: string[] = [];
  for (const file of files.slice(0, MAX_FILES)) {
    if (!safePath(file.path) || typeof file.content !== "string") continue;
    const remaining = MAX_PROJECT_CHARS - total; if (remaining <= 0) break;
    const content = file.content.slice(0, Math.min(MAX_FILE_SIZE, remaining));
    chunks.push(`--- ${file.path} ---\n${content}`); total += content.length;
  }
  return chunks.join("\n\n") || "(empty project)";
}

function buildAgentPrompt(projectName: string, projectType: string, files: ProjectFile[], assets: unknown, userPrompt: string, plan: EmberPlanId): string {
  const assetNames = Array.isArray(assets)
    ? assets.filter((a): a is Record<string, unknown> => !!a && typeof a === "object" && typeof a.name === "string").map((a) => String(a.name).slice(0, 120)).slice(0, 50)
    : [];
  return [
    "You are Ember, an expert autonomous game-project coding agent inside Kiln.",
    `Project: ${projectName} (${projectType}).`,
    `Current Ember plan: ${plan}.`,
    "Treat the current project as a real codebase, not a toy snippet. Inspect the complete file map, reason about dependencies and runtime behavior, then make the smallest complete set of changes required by the user.",
    "Before editing, mentally plan the change, identify affected files, preserve existing behavior, and check for import/export and API consistency across the project.",
    "Return ONLY JSON: {\"summary\":\"...\",\"operations\":[{\"type\":\"create|update|delete|rename\",\"path\":\"...\",\"content\":\"...\"}] }.",
    "For create/update, return the COMPLETE file content. Never return diffs, patches, ellipses, or placeholders.",
    "Use relative project paths only. Never use .., absolute paths, shell commands, package installation, or secrets.",
    "Preserve existing behavior unless the user explicitly asks to change it. Prefer focused edits over unnecessary rewrites.",
    "If a feature needs multiple files, actually create/update all required files. Keep the project internally consistent and make sure imports point to real files and exported names exist.",
    "JavaScript runs in Kiln's isolated browser module runtime. ES modules with relative imports are supported. Bare/external imports are not supported unless Kiln explicitly provides them.",
    "Use the available assets when appropriate and reference their exact names. Do not invent asset names.",
    `Available project assets: ${assetNames.length ? assetNames.map((name) => JSON.stringify(name)).join(", ") : "none"}`,
    `Current files:\n${projectText(files)}`,
    `User request: ${userPrompt.trim()}`,
  ].join("\n\n");
}

router.post("/assistant/project", async (req, res) => {
  const body = req.body as { prompt?: unknown; project?: { name?: unknown; type?: unknown }; files?: unknown; assets?: unknown; model?: unknown };
  if (typeof body.prompt !== "string" || !body.prompt.trim()) { res.status(400).json({ error: "A non-empty prompt is required." }); return; }
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) { res.status(503).json({ error: "Groq is not configured on the server." }); return; }
  const files: ProjectFile[] = Array.isArray(body.files)
    ? body.files.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const value = item as Record<string, unknown>;
        return typeof value.path === "string" && typeof value.content === "string" ? [{ path: value.path, content: value.content }] : [];
      }).slice(0, MAX_FILES)
    : [];
  const projectName = typeof body.project?.name === "string" ? body.project.name.slice(0, 100) : "Untitled Game";
  const projectType = body.project?.type === "3D" ? "3D" : "2D";

  let sessionId: string | null = null;
  try {
    const plan = await getEmberPlan(req);
    sessionId = ensureBillingSession(req, res);
    const allowed = allowedModels(plan);
    const requestedModel = typeof body.model === "string" && body.model.trim() ? body.model.trim() : EMBER_PLANS[plan].model;
    if (!allowed.includes(requestedModel)) {
      res.status(403).json({ error: `The ${requestedModel} model requires a higher Ember plan.`, requiredPlan: requestedModel === EMBER_PLANS.premium_plus.model ? "premium_plus" : "premium" });
      return;
    }
    const reserved = await reserveDailyRequest(sessionId, plan);
    if (!reserved) {
      res.status(429).json({ error: `You've reached the ${EMBER_PLANS[plan].dailyRequests}-request daily limit for the ${EMBER_PLANS[plan].label} plan.`, plan, dailyRequests: EMBER_PLANS[plan].dailyRequests });
      return;
    }
    const model = requestedModel;
    const upstream = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 16_384,
        ...(model.startsWith("openai/gpt-oss-") ? { reasoning_effort: DEFAULT_REASONING_EFFORT } : { reasoning_effort: "default" }),
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "kiln_project_agent",
            strict: true,
            schema: {
              type: "object", additionalProperties: false,
              properties: {
                summary: { type: "string" },
                operations: { type: "array", items: { type: "object", additionalProperties: false, properties: { type: { type: "string", enum: ["create", "update", "delete", "rename"] }, path: { type: "string" }, from: { type: ["string", "null"] }, content: { type: ["string", "null"] } }, required: ["type", "path", "from", "content"] } },
              },
              required: ["summary", "operations"],
            },
          },
        },
        messages: [{ role: "user", content: buildAgentPrompt(projectName, projectType, files, body.assets, body.prompt, plan) }],
      }),
    });
    const data = await upstream.json() as { error?: { message?: string } | string; choices?: Array<{ message?: { content?: string | null } }> };
    if (!upstream.ok) { const message = typeof data.error === "string" ? data.error : data.error?.message || `Groq returned ${upstream.status}`; res.status(502).json({ error: message }); return; }
    const reply = data.choices?.[0]?.message?.content;
    if (typeof reply !== "string") { res.status(502).json({ error: "Ember returned an empty response." }); return; }
    let parsed: unknown;
    try { parsed = JSON.parse(reply); } catch { res.status(502).json({ error: "Ember returned malformed project JSON." }); return; }
    const validated = validateOperations(parsed, files);
    if ("error" in validated) { res.status(422).json({ error: validated.error }); return; }
    res.json({ responseFormat: "project", ...validated, model, plan, dailyRequests: EMBER_PLANS[plan].dailyRequests });
  } catch (error) {
    req.log.error({ err: error }, "Project agent request failed");
    res.status(502).json({ error: error instanceof Error ? error.message : "Project agent request failed." });
  }
});

export default router;
