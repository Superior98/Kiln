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

let modelCache: { model: string; expiresAt: number } | null = null;

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
};

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
      : 200;

  try {
    const model = await resolveGroqModel(apiKey);
    const upstream = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: body.prompt.trim() }],
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
    };

    if (!upstream.ok) {
      const message =
        typeof data.error === "string"
          ? data.error
          : data.error?.message || `Groq responded with status ${upstream.status}`;
      res.status(502).json({ error: message });
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
      res.status(502).json({ error: `Groq returned no text for model ${model}.` });
      return;
    }

    res.json({ reply, model });
  } catch (error) {
    req.log.error({ err: error }, "Groq assistant request failed");
    res.status(502).json({ error: "Unable to reach Groq right now." });
  }
});

export default router;