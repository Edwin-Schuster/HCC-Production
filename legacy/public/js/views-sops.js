'use strict';
/* SOP handbook: Mintlify-style docs with sidebar nav, TOC, search, rich markdown editor. */

function sopGroups() {
  const s = settings().sopGroups || [];
  const extra = list('sops').map((p) => p.group).filter((g) => g && !s.includes(g));
  return [...s, ...new Set(extra)];
}
function sopsByGroup() {
  const groups = sopGroups();
  const pages = [...list('sops')].sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.title.localeCompare(b.title));
  return groups.map((g) => [g, pages.filter((p) => p.group === g)]).filter(([, ps]) => ps.length).concat(
    pages.some((p) => !p.group || !groups.includes(p.group)) ? [['Other', pages.filter((p) => !p.group || !groups.includes(p.group))]] : [],
  );
}

function docsNav(activeId) {
  const open = S.ui.docsNav;
  return `<aside class="docs-nav ${open ? 'open' : ''}">
    <button class="docs-search" data-click="openSearch">${icon('search')}<span>Search SOPs</span><kbd>⌘K</kbd></button>
    ${isEditor() ? `<button class="btn btn-sm full-w" data-click="newSop">${icon('plus')} New SOP</button>` : ''}
    <nav>${sopsByGroup().map(([g, ps]) => `<div class="docs-group"><div class="docs-group-title">${esc(g)}</div>${ps.map((p) => `<button class="docs-link ${p.id === activeId ? 'on' : ''}" data-click="go" data-to="/sops/${p.id}"><span class="docs-ico">${esc(p.icon || '•')}</span><span>${esc(p.title)}</span>${!p.public ? '<span class="lock" title="Team only">team</span>' : ''}</button>`).join('')}</div>`).join('')}</nav>
  </aside>`;
}

function viewSopIndex() {
  const groups = sopsByGroup();
  const total = list('sops').length;
  return `<div class="docs">${docsNav()}
    <div class="doc-main"><button class="btn btn-sm docs-toggle" data-click="toggleDocsNav">${icon('menu')} Browse SOPs</button>
      <section class="docs-hero">
        <div class="eyebrow">${esc(settings().orgName || 'HCC Production')} · Handbook</div>
        <h1>Standard Operating Procedures</h1>
        <p class="lead">${total} procedure${total === 1 ? '' : 's'} for running services, events and maintenance at Hope Christian Church.</p>
        <button class="docs-search big" data-click="openSearch">${icon('search')}<span>Search procedures, steps and settings…</span><kbd>⌘K</kbd></button>
      </section>
      ${groups.length ? groups.map(([g, ps]) => `<section class="docs-section"><h2>${esc(g)}</h2><div class="doc-cards">${ps.map((p) => `<button class="doc-card" data-click="go" data-to="/sops/${p.id}"><span class="doc-card-ico">${esc(p.icon || '•')}</span><span class="doc-card-title">${esc(p.title)}</span><span class="doc-card-desc">${esc(p.description || '')}</span><span class="doc-card-meta">Updated ${ago(p.updatedAt || p.createdAt)}</span></button>`).join('')}</div></section>`).join('')
        : emptyState('No SOPs yet', isEditor() ? 'Write the first procedure for your team.' : 'Nothing has been published yet.', isEditor() ? '<button class="btn btn-primary" data-click="newSop">New SOP</button>' : '')}
    </div></div>`;
}

function viewSop({ id }) {
  const p = byId('sops', id);
  if (!p) return emptyState('SOP not found', 'It may have been deleted, or it is only visible to signed-in team members.', `<button class="btn" data-click="go" data-to="/sops">All SOPs</button>${!S.user ? ' <button class="btn btn-primary" data-click="go" data-to="/login">Sign in</button>' : ''}`);
  const toc = [];
  const html = md(p.body, toc);
  const flat = sopsByGroup().flatMap(([, ps]) => ps);
  const i = flat.findIndex((x) => x.id === id);
  const prev = flat[i - 1], next = flat[i + 1];
  return `<div class="docs">${docsNav(id)}
    <div class="doc-main">
      <button class="btn btn-sm docs-toggle" data-click="toggleDocsNav">${icon('menu')} Browse SOPs</button>
      <article class="doc">
        <header class="doc-head">
          <div class="eyebrow">${esc(p.group || 'SOP')}</div>
          <h1>${esc(p.title)}</h1>
          ${p.description ? `<p class="lead">${esc(p.description)}</p>` : ''}
          <div class="doc-meta"><span>Updated ${ago(p.updatedAt || p.createdAt)}${p.updatedBy && userName(p.updatedBy) ? ` by ${esc(userName(p.updatedBy))}` : ''}</span>${p.public ? pill('Public', 'public') : pill('Team only', 'team')}
            <span class="spacer"></span>
            <button class="btn btn-sm btn-ghost hide-sm" data-click="print">${icon('printer')} PDF</button>
            ${isEditor() ? `<button class="btn btn-sm" data-click="go" data-to="/sops/${p.id}/edit">${icon('edit')} Edit</button>` : ''}
          </div>
        </header>
        <div class="prose">${html}</div>
        <footer class="doc-foot">
          ${prev ? `<button class="pager" data-click="go" data-to="/sops/${prev.id}"><span class="muted small">Previous</span><span>${esc(prev.title)}</span></button>` : '<span></span>'}
          ${next ? `<button class="pager next" data-click="go" data-to="/sops/${next.id}"><span class="muted small">Next</span><span>${esc(next.title)}</span></button>` : '<span></span>'}
        </footer>
      </article>
    </div>
    <aside class="doc-toc">${toc.length ? `<div class="toc-title">On this page</div>${toc.map((t) => `<button class="toc-link lvl${t.lvl}" data-click="scrollTo" data-target="${t.id}">${esc(t.text.replace(/[`*_]/g, ''))}</button>`).join('')}` : ''}</aside>
  </div>`;
}

const MD_SNIPPETS = {
  h2: ['## ', 'Heading'],
  bold: ['**', 'bold text', '**'],
  list: ['- ', 'List item'],
  check: ['- [ ] ', 'Checklist item'],
  steps: [':::steps\n### ', 'First step', '\nDescribe what to do.\n\n### Second step\nDescribe what to do.\n:::\n'],
  note: [':::note ', 'Heads up', '\nCallout text.\n:::\n'],
  warning: [':::warning ', 'Careful', '\nWhat could go wrong.\n:::\n'],
  tip: [':::tip ', 'Tip', '\nA helpful shortcut.\n:::\n'],
  accordion: [':::accordion ', 'Troubleshooting', '\nHidden until opened.\n:::\n'],
  table: ['| Column | Column |\n| --- | --- |\n| ', 'Value', ' | Value |\n'],
  code: ['```\n', 'settings or commands', '\n```\n'],
  youtube: ['@[youtube](', 'https://youtu.be/VIDEO_ID', ')\n'],
};

function viewSopEdit({ id }) {
  const existing = byId('sops', id);
  const p = existing || { id, title: '', group: sopGroups()[0] || 'General', body: '', public: true, order: 10, icon: '•', description: '' };
  const mode = S.ui.sopEditMode || 'split';
  onAfter(() => updateSopPreview());
  return `<div class="sop-editor">
    ${pageHead(existing ? 'Edit SOP' : 'New SOP', 'Write in Markdown. Use the toolbar for steps, callouts, images, GIFs and video.', `<button class="btn btn-ghost" data-click="go" data-to="${existing ? '/sops/' + id : '/sops'}">Cancel</button><button class="btn btn-primary" data-click="saveSop" data-id="${id}">${icon('check')} ${existing ? 'Save' : 'Publish'}</button>`)}
    <div class="sop-meta form-grid">
      <div class="field full"><label class="label" for="sop-title">Title <span class="req">*</span></label><input id="sop-title" class="input input-lg" value="${esc(p.title)}" placeholder="e.g. Sunday System Startup"></div>
      <div class="field full"><label class="label" for="sop-desc">Summary</label><input id="sop-desc" class="input" value="${esc(p.description || '')}" placeholder="One sentence shown under the title"></div>
      <div class="field"><label class="label" for="sop-group">Section</label><input id="sop-group" class="input" list="sop-groups" value="${esc(p.group || '')}"><datalist id="sop-groups">${sopGroups().map((g) => `<option value="${esc(g)}">`).join('')}</datalist></div>
      <div class="field"><label class="label" for="sop-order">Order in section</label><input id="sop-order" class="input" type="number" value="${esc(p.order ?? 10)}"></div>
      <div class="field"><label class="label" for="sop-icon">Icon (one character)</label><input id="sop-icon" class="input" maxlength="2" value="${esc(p.icon || '•')}"></div>
      <div class="field"><label class="label">Visibility</label><label class="check"><input id="sop-public" type="checkbox" ${p.public ? 'checked' : ''}> <span>Public (readable without signing in)</span></label></div>
    </div>
    <div class="md-toolbar" role="toolbar" aria-label="Formatting">
      ${[['h2', 'H2'], ['bold', 'B'], ['list', '• List'], ['check', '☐ Checklist'], ['steps', 'Steps'], ['note', 'Note'], ['tip', 'Tip'], ['warning', 'Warning'], ['accordion', 'Accordion'], ['table', 'Table'], ['code', 'Code'], ['youtube', 'YouTube']].map(([k, l]) => `<button class="btn btn-xs" data-click="mdInsert" data-snip="${k}">${l}</button>`).join('')}
      <button class="btn btn-xs btn-accent" data-click="mdUpload" data-accept="image/*">${icon('image')} Photo / GIF</button>
      <button class="btn btn-xs btn-accent" data-click="mdUpload" data-accept="video/*">${icon('camera')} Video</button>
      <span class="spacer"></span>
      <div class="seg">${[['write', 'Write'], ['split', 'Split'], ['preview', 'Preview']].map(([k, l]) => `<button class="seg-btn ${mode === k ? 'on' : ''}" data-click="sopMode" data-mode="${k}">${l}</button>`).join('')}</div>
    </div>
    <div class="md-panes mode-${mode}">
      <textarea id="sop-body" class="input mono md-input" data-input="sopPreview" data-md-upload="1" spellcheck="true" placeholder="Start writing… Drop or paste images and videos here.">${esc(p.body)}</textarea>
      <div class="md-preview prose" id="sop-preview" aria-live="polite"></div>
    </div>
    ${existing ? `<div class="row"><button class="btn btn-ghost danger-text" data-click="deleteSop" data-id="${id}">${icon('trash')} Delete this SOP</button></div>` : ''}
  </div>`;
}

function updateSopPreview() {
  const ta = $('#sop-body'), pv = $('#sop-preview');
  if (ta && pv) pv.innerHTML = md(ta.value) || '<p class="muted">Preview appears here.</p>';
}

function insertAtCursor(ta, before, middle = '', after = '') {
  const s = ta.selectionStart, e = ta.selectionEnd;
  const sel = ta.value.slice(s, e) || middle;
  const needNL = s > 0 && ta.value[s - 1] !== '\n' && /^(\n|#|:::|-|\||```|@|!)/.test(before) ? '\n' : '';
  ta.setRangeText(needNL + before + sel + after, s, e, 'end');
  const selStart = s + needNL.length + before.length;
  ta.focus(); ta.setSelectionRange(selStart, selStart + sel.length);
  updateSopPreview();
}

async function insertMediaFiles(ta, files) {
  const pub = $('#sop-public')?.checked;
  const ups = await uploadFiles(files, { public: pub });
  for (const f of ups) {
    const snippet = isVideo(f.mime) ? `\n![video: ${f.name}](/files/${f.fileId})\n` : `\n![${f.name.replace(/\.[^.]+$/, '')}](/files/${f.fileId})\n`;
    ta.setRangeText(snippet, ta.selectionStart, ta.selectionEnd, 'end');
  }
  updateSopPreview();
}

function openSearch() {
  const l = openModal({ title: 'Search SOPs', cls: 'search-modal', body: `<input id="sop-q" class="input input-lg" placeholder="Search titles, steps, settings…" data-input="sopSearch" autofocus><div id="sop-results" class="search-results"></div>` });
  runSopSearch('');
  return l;
}
function runSopSearch(q) {
  const box = $('#sop-results'); if (!box) return;
  const term = q.trim().toLowerCase();
  const pages = list('sops');
  const hits = pages.map((p) => {
    const hay = `${p.title}\n${p.description || ''}\n${p.body || ''}`.toLowerCase();
    if (term && !hay.includes(term)) return null;
    let snippet = p.description || '';
    if (term) { const i = (p.body || '').toLowerCase().indexOf(term); if (i >= 0) snippet = '…' + (p.body || '').slice(Math.max(0, i - 50), i + 90).replace(/[#*:`>|_-]+/g, ' ') + '…'; }
    const score = p.title.toLowerCase().includes(term) ? 2 : 1;
    return { p, snippet, score };
  }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 20);
  const hl = (s) => term ? esc(s).replace(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), (m) => `<mark>${m}</mark>`) : esc(s);
  box.innerHTML = hits.length ? hits.map(({ p, snippet }) => `<button class="search-hit" data-click="searchGo" data-to="/sops/${p.id}"><span class="muted small">${esc(p.group || '')}</span><span class="search-hit-title">${hl(p.title)}</span><span class="small">${hl(snippet)}</span></button>`).join('') : '<p class="muted pad">No SOPs match that search.</p>';
}
