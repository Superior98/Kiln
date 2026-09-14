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
    return files.filter((path: unknown): path is string => typeof path === 'string')
      .map((path: string) => ({ path, content: typeof contents[path] === 'string' ? contents[path] : '' }));
  } catch { return []; }
}

function writeProjectFiles(projectId: string, files: KilnProjectFile[]) {
  const saved = JSON.parse(window.localStorage.getItem('kiln-project-files-v1') || '{}');
  const existing = saved?.[projectId] && typeof saved[projectId] === 'object' ? saved[projectId] : {};
  saved[projectId] = { ...existing, files: files.map((file) => file.path), contents: Object.fromEntries(files.map((file) => [file.path, file.content])) };
  window.localStorage.setItem('kiln-project-files-v1', JSON.stringify(saved));
}

function operationFiles(operations: KilnProjectOperation[]) {
  return operations.map((operation) => ({ path: operation.path, action: operation.type }));
}

function resolvePath(from: string, specifier: string, files: Map<string, string>) {
  const parts = from.replace(/\\/g, '/').split('/');
  parts.pop();
  for (const part of specifier.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop(); else parts.push(part);
  }
  const raw = parts.join('/');
  return [raw, `${raw}.js`, `${raw}.mjs`, `${raw}/index.js`].find((path) => files.has(path)) || null;
}

/**
 * Compatibility runtime for the existing single-script CodeSandbox.
 * Ember still edits a genuine multi-file project. When game.js imports
 * project-local modules, we compile those modules into a deterministic
 * CommonJS-style in-sandbox loader and store the generated runtime only
 * in game.js. The source modules remain real, editable project files.
 */
function buildRuntimeEntry(files: KilnProjectFile[]) {
  const map = new Map(files.map((file) => [file.path.replace(/^\.\//, ''), file.content]));
  const entry = map.get('game.js');
  if (!entry || !/\b(?:import|export)\b/.test(entry)) return null;

  const cache = new Map<string, string>();
  const building = new Set<string>();

  const transform = (path: string): string => {
    if (cache.has(path)) return cache.get(path)!;
    if (building.has(path)) throw new Error(`Circular module import detected at ${path}.`);
    const source = map.get(path);
    if (source == null) throw new Error(`Missing imported project file: ${path}`);
    building.add(path);

    let code = source;
    code = code.replace(/import\s+([\s\S]*?)\s+from\s+['"](\.[^'"]+)['"]\s*;?/g, (_m, bindings: string, spec: string) => {
      const resolved = resolvePath(path, spec, map);
      if (!resolved) throw new Error(`Cannot resolve ${spec} from ${path}.`);
      const request = JSON.stringify(resolved);
      const value = bindings.trim();
      if (value.startsWith('{')) {
        const inner = value.slice(1, -1).trim();
        if (!inner) return `const __dep = require(${request});`;
        const mapped = inner.split(',').map((part: string) => {
          const bits = part.trim().split(/\s+as\s+/);
          return bits.length === 2 ? `${bits[0]}: ${bits[1]}` : part.trim();
        }).join(', ');
        return `const { ${mapped} } = require(${request});`;
      }
      if (value.startsWith('* as ')) return `const ${value.slice(5).trim()} = require(${request});`;
      if (value.includes(',')) {
        const [def, named] = value.split(/,(.+)/s);
        const namedInner = named.trim().replace(/^\{/, '').replace(/\}$/, '').trim();
        const mapped = namedInner.split(',').filter(Boolean).map((part: string) => {
          const bits = part.trim().split(/\s+as\s+/);
          return bits.length === 2 ? `${bits[0]}: ${bits[1]}` : part.trim();
        }).join(', ');
        return `const ${def.trim()} = require(${request}).default; const { ${mapped} } = require(${request});`;
      }
      return `const ${value} = require(${request}).default;`;
    });
    code = code.replace(/import\s+['"](\.[^'"]+)['"]\s*;?/g, (_m, spec: string) => {
      const resolved = resolvePath(path, spec, map);
      if (!resolved) throw new Error(`Cannot resolve ${spec} from ${path}.`);
      return `require(${JSON.stringify(resolved)});`;
    });

    const exportNames: string[] = [];
    code = code.replace(/export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g, (_m, name: string) => { exportNames.push(name); return `function ${name}`; });
    code = code.replace(/export\s+class\s+([A-Za-z_$][\w$]*)/g, (_m, name: string) => { exportNames.push(name); return `class ${name}`; });
    code = code.replace(/export\s+(const|let|var)\s+([A-Za-z_$][\w$]*)/g, (_m, kind: string, name: string) => { exportNames.push(name); return `${kind} ${name}`; });
    code = code.replace(/export\s+default\s+/g, 'exports.default = ');
    code = code.replace(/export\s*\{([^}]+)\}\s*;?/g, (_m, inner: string) => inner.split(',').map((part: string) => {
      const bits = part.trim().split(/\s+as\s+/);
      return `exports.${bits[1] || bits[0]} = ${bits[0]};`;
    }).join('\n'));
    code = code.replace(/export\s*\*\s*from\s*['"](\.[^'"]+)['"]\s*;?/g, (_m, spec: string) => {
      const resolved = resolvePath(path, spec, map);
      if (!resolved) throw new Error(`Cannot resolve ${spec} from ${path}.`);
      return `Object.assign(exports, require(${JSON.stringify(resolved)}));`;
    });

    const footer = exportNames.map((name) => `exports.${name} = ${name};`).join('\n');
    const result = `${code}\n${footer}`;
    building.delete(path);
    cache.set(path, result);
    return result;
  };

  const modules: Record<string, string> = {};
  for (const path of map.keys()) {
    if (/\.(?:js|mjs|cjs)$/.test(path)) modules[path] = transform(path);
  }
  const json = JSON.stringify(modules).replace(/<\/script/gi, '<\\/script');
  return `(function(){const __mods=${json};const __cache={};function __req(p){if(__cache[p])return __cache[p].exports;if(!__mods[p])throw new Error('Module not found: '+p);const module={exports:{}};__cache[p]=module;new Function('exports','module','require','Kiln',__mods[p])(module.exports,module,__req,window.Kiln);return module.exports;}__req('game.js');})();`;
}

function compatibleResponse(original: any, summary: string, operations: KilnProjectOperation[], currentFiles: KilnProjectFile[], projectId: string) {
  const changedExisting = operations.filter((operation) => operation.type === 'update')
    .map((operation) => ({ path: operation.path, content: operation.content }))
    .filter((file) => currentFiles.some((existing) => existing.path === file.path));
  const fallback = currentFiles.find((file) => file.path === 'game.js') || currentFiles[0];
  const files = changedExisting.length ? changedExisting : fallback ? [fallback] : [];
  recordProjectChange({ agent: 'Ember', projectId, projectName: PROJECTS.find((p) => p.id === projectId)?.name, summary, files: operationFiles(operations) });
  return new Response(JSON.stringify({ ...original, responseFormat: 'code', summary, reply: summary, files }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

export function installProjectAgentBridge() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString();
    if (!url.endsWith('/api/assistant') || (init?.method || 'GET').toUpperCase() !== 'POST') return nativeFetch(input, init);
    let body: any;
    try { body = typeof init?.body === 'string' ? JSON.parse(init.body) : null; } catch { return nativeFetch(input, init); }
    if (body?.responseFormat !== 'code') return nativeFetch(input, init);

    const project = projectFromRequest(body);
    const files = readProjectFiles(project.id);
    if (!files.length) return nativeFetch(input, init);

    try {
      const response = await nativeFetch('/api/assistant/project', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: body.prompt, project: body.project, files, assets: body.assets, model: body.model }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return new Response(JSON.stringify(data), { status: response.status, headers: { 'Content-Type': 'application/json' } });

      const operations = Array.isArray(data.operations) ? data.operations as KilnProjectOperation[] : [];
      const applied = applyProjectOperations(files, operations);
      let finalFiles = applied;
      try {
        const runtime = buildRuntimeEntry(applied);
        if (runtime) {
          finalFiles = applied.map((file) => file.path === 'game.js' ? { ...file, content: runtime } : file);
        }
      } catch (error) {
        return new Response(JSON.stringify({ error: `Project runtime build failed: ${error instanceof Error ? error.message : String(error)}` }), { status: 422, headers: { 'Content-Type': 'application/json' } });
      }
      writeProjectFiles(project.id, finalFiles);
      return compatibleResponse(data, data.summary || 'Updated the project.', operations, files, project.id);
    } catch (error) {
      return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }
  };
}

installProjectAgentBridge();
