import React, { useEffect, useState } from 'react';
import { getProjectChanges } from '../lib/project-history.ts';

export function ChangesPanel({ projectId }) {
  const [changes, setChanges] = useState(() => getProjectChanges(projectId));
  const [filter, setFilter] = useState('All');

  useEffect(() => {
    const refresh = () => setChanges(getProjectChanges(projectId));
    refresh();
    window.addEventListener('kiln:project-change', refresh);
    return () => window.removeEventListener('kiln:project-change', refresh);
  }, [projectId]);

  const visible = filter === 'All' ? changes : changes.filter((change) => change.agent === filter);

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 18, color: '#e7e5e4', background: '#0b090d' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Changes</div>
          <div style={{ fontSize: 12, color: '#a8a29e', marginTop: 4 }}>Persistent agent history for this project.</div>
        </div>
        <select value={filter} onChange={(event) => setFilter(event.target.value)} style={{ background: '#17131a', color: '#e7e5e4', border: '1px solid #332c36', borderRadius: 8, padding: '7px 9px' }}>
          <option>All</option>
          <option>Ember</option>
          <option>ChatGPT</option>
          <option>Claude</option>
        </select>
      </div>

      {visible.length === 0 ? (
        <div style={{ border: '1px dashed #332c36', borderRadius: 12, padding: 20, color: '#78716c', textAlign: 'center' }}>
          No agent changes recorded for this project yet.
        </div>
      ) : visible.map((change) => (
        <div key={change.id} style={{ border: '1px solid #2b252d', borderRadius: 12, padding: 14, marginBottom: 10, background: '#100d12' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <strong>{change.agent}</strong>
            <span style={{ color: '#78716c', fontSize: 11 }}>{new Date(change.timestamp).toLocaleString()}</span>
          </div>
          <div style={{ marginTop: 8, lineHeight: 1.45 }}>{change.summary}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {change.files.map((file, index) => (
              <span key={`${change.id}-${file.path}-${index}`} style={{ borderRadius: 6, padding: '3px 7px', background: '#1c1720', color: '#c4b5fd', fontSize: 11 }}>
                {file.action} · {file.path}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default ChangesPanel;
