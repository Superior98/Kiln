import { getProjectChanges, type ProjectChangeAgent } from './project-history';

const mount = () => {
  if (document.getElementById('kiln-changes-dock')) return;

  const style = document.createElement('style');
  style.textContent = `
    #kiln-changes-dock{position:fixed;right:14px;bottom:14px;z-index:2147483000;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
    #kiln-changes-button{border:1px solid rgba(245,158,11,.28);background:rgba(20,17,23,.94);color:#d6d3d1;border-radius:10px;padding:8px 11px;cursor:pointer;box-shadow:0 10px 35px rgba(0,0,0,.35);font-size:11px}
    #kiln-changes-button:hover{border-color:rgba(245,158,11,.55);color:#fbbf24}
    #kiln-changes-panel{display:none;width:min(430px,calc(100vw - 28px));max-height:min(560px,70vh);overflow:hidden;margin-bottom:8px;border:1px solid #3f3f46;border-radius:14px;background:rgba(12,10,13,.98);box-shadow:0 18px 70px rgba(0,0,0,.55);backdrop-filter:blur(14px)}
    #kiln-changes-panel.open{display:block}
    .kiln-c-head{display:flex;align-items:center;justify-content:space-between;padding:11px 13px;border-bottom:1px solid #292524;color:#fafaf9;font-size:12px}
    .kiln-c-tabs{display:flex;gap:5px;padding:8px;border-bottom:1px solid #292524;overflow:auto}
    .kiln-c-tab{border:1px solid #292524;background:#181518;color:#a8a29e;border-radius:7px;padding:5px 8px;font:inherit;font-size:10px;cursor:pointer;white-space:nowrap}
    .kiln-c-tab.active{border-color:rgba(245,158,11,.4);color:#fbbf24;background:rgba(245,158,11,.08)}
    .kiln-c-list{overflow:auto;max-height:450px;padding:8px}
    .kiln-c-item{border:1px solid #292524;background:#171417;border-radius:9px;padding:9px;margin-bottom:7px}
    .kiln-c-meta{display:flex;justify-content:space-between;gap:8px;color:#78716c;font-size:9px}
    .kiln-c-agent{color:#fbbf24}.kiln-c-summary{color:#d6d3d1;font-size:10px;margin-top:5px;line-height:1.45}.kiln-c-files{color:#78716c;font-size:9px;margin-top:5px;line-height:1.5;word-break:break-word}
    .kiln-c-empty{padding:22px 10px;text-align:center;color:#57534e;font-size:10px}
  `;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'kiln-changes-dock';
  const panel = document.createElement('div');
  panel.id = 'kiln-changes-panel';
  const head = document.createElement('div');
  head.className = 'kiln-c-head';
  const title = document.createElement('span');
  title.textContent = 'Agent changes';
  const close = document.createElement('button');
  close.textContent = '×';
  close.style.cssText = 'border:0;background:none;color:#78716c;cursor:pointer;font-size:16px';
  head.append(title, close);

  const tabs = document.createElement('div');
  tabs.className = 'kiln-c-tabs';
  const list = document.createElement('div');
  list.className = 'kiln-c-list';
  panel.append(head, tabs, list);

  const button = document.createElement('button');
  button.id = 'kiln-changes-button';
  button.textContent = '◈ Changes';
  root.append(panel, button);
  document.body.appendChild(root);

  let filter: ProjectChangeAgent | 'All' = 'All';
  const filters: Array<ProjectChangeAgent | 'All'> = ['All', 'Ember', 'ChatGPT', 'Claude'];

  const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' } as Record<string, string>)[char]);

  const render = () => {
    list.replaceChildren();
    const changes = getProjectChanges().filter((entry) => filter === 'All' || entry.agent === filter).slice(0, 60);
    if (!changes.length) {
      const empty = document.createElement('div');
      empty.className = 'kiln-c-empty';
      empty.textContent = filter === 'Claude'
        ? 'Claude repository handoff: CLAUDE_CHANGES.md. Runtime Claude entries appear when recorded.'
        : 'No changes recorded yet.';
      list.appendChild(empty);
      return;
    }
    for (const change of changes) {
      const item = document.createElement('div');
      item.className = 'kiln-c-item';
      const meta = document.createElement('div');
      meta.className = 'kiln-c-meta';
      const agent = document.createElement('span');
      agent.className = 'kiln-c-agent';
      agent.textContent = change.agent;
      const time = document.createElement('span');
      time.textContent = new Date(change.timestamp).toLocaleString();
      meta.append(agent, time);
      const summary = document.createElement('div');
      summary.className = 'kiln-c-summary';
      summary.textContent = change.summary;
      const files = document.createElement('div');
      files.className = 'kiln-c-files';
      files.textContent = change.files.map((file) => `${file.action}: ${file.path}`).join(' · ');
      item.append(meta, summary, files);
      list.appendChild(item);
    }
  };

  for (const name of filters) {
    const tab = document.createElement('button');
    tab.className = 'kiln-c-tab';
    tab.textContent = name;
    tab.dataset.agent = name;
    tab.onclick = () => {
      filter = name;
      tabs.querySelectorAll('.kiln-c-tab').forEach((element) => element.classList.remove('active'));
      tab.classList.add('active');
      render();
    };
    if (name === 'All') tab.classList.add('active');
    tabs.appendChild(tab);
  }

  button.onclick = () => { panel.classList.toggle('open'); render(); };
  close.onclick = () => panel.classList.remove('open');
  window.addEventListener('kiln:project-change', render);
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
else mount();
