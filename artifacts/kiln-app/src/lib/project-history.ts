export type ProjectChangeAgent = 'Ember' | 'ChatGPT' | 'Claude';

export type ProjectChange = {
  id: string;
  agent: ProjectChangeAgent;
  projectId: string;
  projectName?: string;
  timestamp: number;
  summary: string;
  files: Array<{ path: string; action: 'create' | 'update' | 'delete' | 'rename' }>;
};

const STORAGE_KEY = 'kiln-agent-changes-v1';
const MAX_ENTRIES = 200;

function read(): ProjectChange[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function getProjectChanges(projectId?: string): ProjectChange[] {
  const entries = read();
  return projectId ? entries.filter((entry) => entry.projectId === projectId) : entries;
}

export function recordProjectChange(change: Omit<ProjectChange, 'id' | 'timestamp'> & Partial<Pick<ProjectChange, 'id' | 'timestamp'>>): ProjectChange {
  const entry: ProjectChange = {
    ...change,
    id: change.id || `change-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: change.timestamp || Date.now(),
  };
  const next = [entry, ...read()].slice(0, MAX_ENTRIES);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('kiln:project-change', { detail: entry }));
  return entry;
}

export function clearProjectChanges(projectId?: string) {
  const next = projectId ? read().filter((entry) => entry.projectId !== projectId) : [];
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('kiln:project-change', { detail: null }));
}
