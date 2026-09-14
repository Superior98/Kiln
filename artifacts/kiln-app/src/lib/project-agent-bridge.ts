import { applyProjectOperations, type KilnProjectFile, type KilnProjectOperation } from './project-agent';
import { recordProjectChange } from './project-history';

const PROJECTS = [
  { id: 'ember-runner', name: 'Ember Runner', type: '2D' },
  { id: 'skyward-drift', name: 'Skyward Drift', type: '3D' },
  { id: 'bramble-maze', name: 'Bramble Maze', type: '2D' },
] as const;

let installed = false;

function projectFromRequest(body: any) {
  const name = typeof body?.project?.name === 'string' ? body.project.name : '';
  return PROJECTS.find((project) => project.name === name) || PROJECTS[0];
}

function readProjectFiles(projectId: string): KilnProjectFile[] {
  try {
    const saved = JSON.parse(window.localStorage.getItem('kiln-project-files-v1') || '{}');
    const project = saved?.[projectId];
    if (!project || typeof project !== 'object') return [];
    const files = Array.isArray(project.files) ? project.files : [];
    const contents = project.contents && typeof project.contents === 'object' ? project.contents : {};
    return files
      .filter((path: unknown): path is string => typeof path === 'string')
      .map((path: string) => ({ path, content: typeof contents[path] === 'string' ? contents[path] : '' }));
  } catch {
    return [];
  }
}

function writeProjectFiles(projectId: string, files: KilnProjectFile[]) {
  const saved = JSON.parse(window.localStorage.getItem('kiln-project-files-v1') || '{}');
  const existing = saved?.[projectId] && typeof saved[projectId] === 'object' ? saved[projectId] : {};
  saved[projectId] = {
    ...existing,
    files: files.map((file) => file.path),
    contents: Object.fromEntries(files.map((file) => [file.path, file.content])),
  };
  window.localStorage.setItem('kiln-project-files-v1', JSON.stringify(saved));
}

function operationFiles(operations: KilnProjectOperation[]) {
  return operations.map((operation) => ({
    path: operation.type === 'rename' ? operation.path : operation.path,
    action: operation.type,
  }));
}

function compatibleResponse(
  original: any,
  summary: string,
  operations: KilnProjectOperation[],
  currentFiles: KilnProjectFile[],
  projectId: string,
) {
  const changedExisting = operations
    .filter((operation) => operation.type === 'update')
    .map((operation) => ({ path: operation.path, content: operation.content }))
    .filter((file) => currentFiles.some((existing) => existing.path === file.path));

  // KilnApp's current React state predates create/delete/rename operations.
  // Persist those operations immediately and force a clean reload after the
  // response so the existing state loader picks up the complete new file map.
  // Pure updates stay in-place with no reload.
  const structuralChange = operations.some((operation) => operation.type !== 'update');
  if (structuralChange) {
    window.setTimeout(() => window.location.reload(), 80);
  }

  // Never make the old one-file validator reject a legitimate structural
  // operation. If there are no compatible updates, return the existing entry
  // unchanged; the persisted operation + reload is the source of truth.
  const fallback = currentFiles.find((file) => file.path === 'game.js') || currentFiles[0];
  const files = changedExisting.length ? changedExisting : fallback ? [fallback] : [];

  recordProjectChange({
    agent: 'Ember',
    projectId,
    projectName: PROJECTS.find((p) => p.id === projectId)?.name,
    summary,
    files: operationFiles(operations),
  });

  return new Response(JSON.stringify({
    ...original,
    responseFormat: 'code',
    summary,
    reply: summary,
    files,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function installProjectAgentBridge() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString();
    if (!url.endsWith('/api/assistant') || (init?.method || 'GET').toUpperCase() !== 'POST') {
      return nativeFetch(input, init);
    }

    let body: any;
    try {
      body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    } catch {
      return nativeFetch(input, init);
    }

    if (body?.responseFormat !== 'code') return nativeFetch(input, init);

    const project = projectFromRequest(body);
    const files = readProjectFiles(project.id);
    if (!files.length) return nativeFetch(input, init);

    try {
      const response = await nativeFetch('/api/assistant/project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: body.prompt,
          project: body.project,
          files,
          assets: body.assets,
          model: body.model,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        return new Response(JSON.stringify(data), {
          status: response.status,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const operations = Array.isArray(data.operations) ? data.operations as KilnProjectOperation[] : [];
      const applied = applyProjectOperations(files, operations);
      writeProjectFiles(project.id, applied);
      return compatibleResponse(data, data.summary || 'Updated the project.', operations, files, project.id);
    } catch (error) {
      return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  };
}

installProjectAgentBridge();
