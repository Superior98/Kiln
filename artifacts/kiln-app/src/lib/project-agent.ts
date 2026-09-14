export type KilnProjectFile = {
  path: string;
  content: string;
};

export type KilnProjectOperation =
  | { type: "create" | "update"; path: string; content: string }
  | { type: "delete"; path: string }
  | { type: "rename"; from: string; path: string };

export type KilnProjectAgentResponse = {
  responseFormat: "project";
  summary: string;
  operations: KilnProjectOperation[];
  model?: string;
};

export function applyProjectOperations(
  files: KilnProjectFile[],
  operations: KilnProjectOperation[],
): KilnProjectFile[] {
  const next = new Map(files.map((file) => [file.path, file.content]));

  // Validate the complete operation batch before mutating the caller's
  // project. This makes an Ember response all-or-nothing from the UI's
  // perspective instead of leaving half an edit behind after an error.
  for (const operation of operations) {
    if (operation.type === "create") {
      if (next.has(operation.path)) throw new Error(`Cannot create existing file: ${operation.path}`);
    } else if (operation.type === "update") {
      if (!next.has(operation.path)) throw new Error(`Cannot update missing file: ${operation.path}`);
    } else if (operation.type === "delete") {
      if (!next.has(operation.path)) throw new Error(`Cannot delete missing file: ${operation.path}`);
    } else if (operation.type === "rename") {
      if (!next.has(operation.from)) throw new Error(`Cannot rename missing file: ${operation.from}`);
      if (next.has(operation.path)) throw new Error(`Cannot rename over existing file: ${operation.path}`);
    }
  }

  for (const operation of operations) {
    if (operation.type === "create" || operation.type === "update") {
      next.set(operation.path, operation.content);
    } else if (operation.type === "delete") {
      next.delete(operation.path);
    } else {
      const content = next.get(operation.from)!;
      next.delete(operation.from);
      next.set(operation.path, content);
    }
  }

  return Array.from(next, ([path, content]) => ({ path, content }));
}

export async function requestProjectAgent(input: {
  prompt: string;
  project: { name: string; type: "2D" | "3D" };
  files: KilnProjectFile[];
  assets?: Array<{ name: string; isImage?: boolean }>;
  model?: string;
  signal?: AbortSignal;
}): Promise<KilnProjectAgentResponse> {
  const response = await fetch("/api/assistant/project", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: input.signal,
    body: JSON.stringify({
      prompt: input.prompt,
      project: input.project,
      files: input.files,
      assets: input.assets ?? [],
      model: input.model,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof payload?.error === "string"
        ? payload.error
        : `Ember project agent failed (${response.status}).`,
    );
  }
  if (payload?.responseFormat !== "project" || !Array.isArray(payload?.operations)) {
    throw new Error("Ember returned an invalid project-agent response.");
  }
  return payload as KilnProjectAgentResponse;
}
