import { Router, type IRouter } from "express";

const router: IRouter = Router();
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-oss-20b";
const MAX_FILES = 32;
const MAX_FILE_SIZE = 60_000;
const MAX_PROJECT_CHARS = 500_000;
const SAFE_PATH = /^(?!.*(?:^|\/)\.\.(?:\/|$))(?!\/)(?![A-Za-z]:[\\/])[^\\0]+$/;

type ProjectFile = { path: string; content: string };
type AgentOperation =
  | { type: "create" | "update"; path: string; content: string }
  | { type: "delete"; path: string }
  | { type: "rename"; from: string; path: string };

type AgentResult = { summary: string; operations: AgentOperation[] };

function checkJavaScriptSyntax(code: string): string | null {
  try {
    // Parse only. Generated code is never executed on the server.
    // eslint-disable-next-line no-new-func
    new Function(code);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function safePath(path: string): boolean {
  return SAFE_PATH.test(path) && path.length <= 180 && !path.includes("\\");
}

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
      const path = op.path;
      const content = op.content;
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
      known.add(path);
      operations.push({ type, path, content });
    } else if (type === "delete") {
      const path = op.path;
      if (typeof path !== "string" || !safePath(path)) return { error: "Ember returned an unsafe delete path." };
      if (!known.has(path)) return { error: `Ember tried to delete a missing file: ${path}` };
      known.delete(path);
      operations.push({ type: "delete", path });
    } else if (type === "rename") {
      const from = op.from;
      const path = op.path;
      if (typeof from !== "string" || typeof path !== "string" || !safePath(from) || !safePath(path)) return { error: "Ember returned an unsafe rename." };
      if (!known.has(from)) return { error: `Ember tried to rename a missing file: ${from}` };
      if (known.has(path)) return { error: `Ember tried to rename over an existing file: ${path}` };
      known.delete(from);
      known.add(path);
      operations.push({ type: "rename", from, path });
    } else {
      return { error: `Unsupported Ember operation: ${String(type)}` };
    }
  }

  return {
    summary: typeof value.summary === "string" ? value.summary.trim().slice(0, 600) : "Project updated.",
    operations,
  };
}

function projectText(files: ProjectFile[]): string {
  let total = 0;
  const chunks: string[] = [];
  for (const file of files.slice(0, MAX_FILES)) {
    if (!safePath(file.path) || typeof file.content !== "string") continue;
    const remaining = MAX_PROJECT_CHARS - total;
    if (remaining <= 0) break;
    const content = file.content.slice(0, Math.min(MAX_FILE_SIZE, remaining));
    chunks.push(`--- ${file.path} ---\n${content}`);
    total += content.length;
  }
  return chunks.join("\n\n") || "(empty project)";
}

function buildAgentPrompt(projectName: string, projectType: string, files: ProjectFile[], assets: unknown, userPrompt: string): string {
  const assetNames = Array.isArray(assets)
    ? assets.filter((a): a is Record<string, unknown> => !!a && typeof a === "object" && typeof a.name === "string").map((a) => String(a.name).slice(0, 120)).slice(0, 50)
    : [];
  return [
    "You are Ember, an autonomous game-project coding agent inside Kiln.",
    `Project: ${projectName} (${projectType}).`,
    "You have the complete current project file map below. Make the user's requested change by returning a minimal set of real file operations.",
    "Return ONLY JSON: {\"summary\":\"...\",\"operations\":[{\"type\":\"create|update|delete|rename\",\"path\":\"...\",\"content\":\"...\"}]}.",
    "For create/update, return the COMPLETE file content. Never return diffs, patches, ellipses, or placeholders.",
    "Use relative project paths only. Never use .., absolute paths, shell commands, package installation, or secrets.",
    "Preserve existing behavior unless the user explicitly asks to change it. Prefer editing existing files over unnecessary rewrites.",
    "If a feature needs multiple files, actually create/update all required files. Keep the project internally consistent.",
    "JavaScript must be standalone browser JavaScript unless the existing project clearly uses modules. JSON must remain valid JSON.",
    `Available project assets: ${assetNames.length ? assetNames.map((name) => JSON.stringify(name)).join(", ") : "none"}`,
    `Current files:\n${projectText(files)}`,
    `User request: ${userPrompt.trim()}`,
  ].join("\n\n");
}

router.post("/assistant/project", async (req, res) => {
  const body = req.body as {
    prompt?: unknown;
    project?: { name?: unknown; type?: unknown };
    files?: unknown;
    assets?: unknown;
    model?: unknown;
  };
  if (typeof body.prompt !== "string" || !body.prompt.trim()) {
    res.status(400).json({ error: "A non-empty prompt is required." });
    return;
  }
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "Groq is not configured on the server." });
    return;
  }
  const files: ProjectFile[] = Array.isArray(body.files)
    ? body.files.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const value = item as Record<string, unknown>;
        return typeof value.path === "string" && typeof value.content === "string"
          ? [{ path: value.path, content: value.content }]
          : [];
      }).slice(0, MAX_FILES)
    : [];
  const projectName = typeof body.project?.name === "string" ? body.project.name.slice(0, 100) : "Untitled Game";
  const projectType = body.project?.type === "3D" ? "3D" : "2D";

  try {
    const model = typeof body.model === "string" && body.model.trim() ? body.model : DEFAULT_MODEL;
    const upstream = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 8192,
        messages: [{ role: "user", content: buildAgentPrompt(projectName, projectType, files, body.assets, body.prompt) }],
      }),
    });
    const data = await upstream.json() as { error?: { message?: string } | string; choices?: Array<{ message?: { content?: string | null } }> };
    if (!upstream.ok) {
      const message = typeof data.error === "string" ? data.error : data.error?.message || `Groq returned ${upstream.status}`;
      res.status(502).json({ error: message });
      return;
    }
    const reply = data.choices?.[0]?.message?.content;
    if (typeof reply !== "string") {
      res.status(502).json({ error: "Ember returned an empty response." });
      return;
    }
    const clean = reply.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start < 0 || end <= start) {
      res.status(502).json({ error: "Ember returned invalid project JSON." });
      return;
    }
    let parsed: unknown;
    try { parsed = JSON.parse(clean.slice(start, end + 1)); } catch { res.status(502).json({ error: "Ember returned malformed project JSON." }); return; }
    const validated = validateOperations(parsed, files);
    if ("error" in validated) {
      res.status(422).json({ error: validated.error });
      return;
    }
    res.json({ responseFormat: "project", ...validated, model });
  } catch (error) {
    req.log.error({ err: error }, "Project agent request failed");
    res.status(502).json({ error: error instanceof Error ? error.message : "Project agent request failed." });
  }
});

export default router;
