import { Router, type IRouter } from "express";

const router: IRouter = Router();

// Publishing here means "reachable by a link while this server process is
// running" — there's no accounts/hosting system in this app, so we keep it
// honest with an in-memory store rather than pretending it's a durable CDN
// deployment. Restarting the API server clears published games.
type PublishedGame = {
  slug: string;
  projectName: string;
  projectType: "2D" | "3D";
  files: Record<string, string>;
  publishedAt: string;
};

const published = new Map<string, PublishedGame>();
// Tracks which slug belongs to which client-side project id, so
// "Publish update" republishes to the same URL instead of minting a new one.
const slugByProjectKey = new Map<string, string>();

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60) || "game"
  );
}

function uniqueSlug(base: string) {
  if (!published.has(base)) return base;
  let suffix = 2;
  while (published.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

router.post("/publish", (req, res) => {
  const body = req.body as {
    projectKey?: unknown;
    projectName?: unknown;
    projectType?: unknown;
    files?: unknown;
  };

  if (typeof body.projectKey !== "string" || !body.projectKey) {
    res.status(400).json({ error: "projectKey is required." });
    return;
  }
  if (typeof body.projectName !== "string" || !body.projectName.trim()) {
    res.status(400).json({ error: "projectName is required." });
    return;
  }
  if (body.projectType !== "2D" && body.projectType !== "3D") {
    res.status(400).json({ error: "projectType must be '2D' or '3D'." });
    return;
  }
  if (!body.files || typeof body.files !== "object" || Array.isArray(body.files)) {
    res.status(400).json({ error: "files must be an object of path -> content." });
    return;
  }
  const files = body.files as Record<string, unknown>;
  const cleanFiles: Record<string, string> = {};
  for (const [path, content] of Object.entries(files)) {
    if (typeof content !== "string") {
      res.status(400).json({ error: `File content for ${path} must be a string.` });
      return;
    }
    if (content.length > 200_000) {
      res.status(400).json({ error: `File ${path} is too large to publish.` });
      return;
    }
    cleanFiles[path] = content;
  }

  const existingSlug = slugByProjectKey.get(body.projectKey);
  const slug = existingSlug ?? uniqueSlug(slugify(body.projectName));

  const entry: PublishedGame = {
    slug,
    projectName: body.projectName.trim().slice(0, 80),
    projectType: body.projectType,
    files: cleanFiles,
    publishedAt: new Date().toISOString(),
  };
  published.set(slug, entry);
  slugByProjectKey.set(body.projectKey, slug);

  res.json({ slug, publishedAt: entry.publishedAt });
});

router.get("/play/:slug", (req, res) => {
  const entry = published.get(req.params.slug);
  if (!entry) {
    res.status(404).json({ error: "This game hasn't been published, or was published to a server that has since restarted." });
    return;
  }
  res.json(entry);
});

export default router;
