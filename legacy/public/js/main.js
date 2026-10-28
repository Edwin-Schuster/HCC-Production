'use strict';
/* Schemas, app shell, routes, actions and event wiring. */

const E = HC.ENUMS;
const SCHEMAS = {
  projects: { noun: 'project', fields: [
    { k: 'name', label: 'Name', req: 1, full: 1 }, { k: 'status', label: 'Status', type: 'select', options: E.projectStatus, req: 1 }, { k: 'color', label: 'Colour', type: 'color' },
    { k: 'start', label: 'Start', type: 'date' }, { k: 'end', label: 'Finish', type: 'date' }, { k: 'budget', label: 'Budget ($)', type: 'money' }, { k: 'lead', label: 'Project lead', type: 'user' },
    { k: 'summary', label: 'Summary (visible to viewers)', type: 'textarea', full: 1, rows: 2 }, { k: 'description', label: 'Details (editors only)', type: 'markdown', full: 1 }] },
  tasks: { noun: 'task', fields: [
    { k: 'title', label: 'Title', req: 1, full: 1 }, { k: 'status', label: 'Status', type: 'select', options: E.taskStatus, req: 1 }, { k: 'priority', label: 'Priority', type: 'select', options: E.priority, req: 1 },
    { k: 'start', label: 'Start', type: 'date' }, { k: 'due', label: 'Due', type: 'date' },
    { k: 'assignees', label: 'Assign to', type: 'users', full: 1 }, { k: 'labels', label: 'Labels', type: 'labels', full: 1 },
    { k: 'description', label: 'Description', type: 'markdown', full: 1, rows: 4 }, { k: 'attachments', label: 'Files', type: 'attachments' }] },
  people: { noun: 'person', fields: [
    { k: 'name', label: 'Name', req: 1 }, { k: 'status', label: 'Status', type: 'select', options: E.personStatus }, { k: 'roles', label: 'Production roles', type: 'roles', full: 1 },
    { k: 'phone', label: 'Phone', type: 'tel' }, { k: 'email', label: 'Email', type: 'email' }, { k: 'statusNote', label: 'Status note', full: 1 },
    { k: 'userId', label: 'Linked login', type: 'user', help: 'Lets this person check themselves in.' }, { k: 'notes', label: 'Notes', type: 'textarea', full: 1 }] },
  teamRoles: { noun: 'production role', fields: [{ k: 'name', label: 'Role name', req: 1 }, { k: 'color', label: 'Colour', type: 'color' }, { k: 'description', label: 'What this role does', type: 'textarea', full: 1 }] },
  cables: { noun: 'cable', fields: [
    { k: 'label', label: 'Cable ID', req: 1, placeholder: 'NET-016' }, { k: 'type', label: 'Type', type: 'select', options: E.cableType, req: 1 }, { k: 'from', label: 'From', req: 1 }, { k: 'to', label: 'To', req: 1 },
    { k: 'lengthFt', label: 'Length (ft)', type: 'number' }, { k: 'status', label: 'Status', type: 'select', options: E.cableStatus, req: 1 }, { k: 'room', label: 'Room / area' }, { k: 'projectId', label: 'Project', type: 'project' }, { k: 'notes', label: 'Notes', type: 'textarea', full: 1 }] },
  bom: { noun: 'BOM item', fields: [
    { k: 'item', label: 'Item', req: 1, full: 1 }, { k: 'partNumber', label: 'Part number' }, { k: 'vendor', label: 'Vendor' }, { k: 'category', label: 'Category', type: 'select', options: E.budgetCategory },
    { k: 'status', label: 'Status', type: 'select', options: E.bomStatus, req: 1 }, { k: 'qty', label: 'Quantity', type: 'number', req: 1 }, { k: 'unitCost', label: 'Unit cost ($)', type: 'money' },
    { k: 'url', label: 'Product link', type: 'url', full: 1 }, { k: 'projectId', label: 'Project', type: 'project' }, { k: 'notes', label: 'Notes', type: 'textarea', full: 1 }] },
  purchases: { noun: 'purchase order', fields: [
    { k: 'poNumber', label: 'PO number', req: 1 }, { k: 'vendor', label: 'Vendor', req: 1 }, { k: 'projectId', label: 'Project', type: 'project' }, { k: 'date', label: 'Order date', type: 'date' },
    { k: 'status', label: 'Status', type: 'select', options: E.poStatus, req: 1 }, { k: 'category', label: 'Budget category', type: 'select', options: E.budgetCategory },
    { k: 'lines', label: 'Line items', type: 'lines' }, { k: 'notes', label: 'Notes', type: 'textarea', full: 1 }, { k: 'attachments', label: 'Quotes, receipts & packing slips', type: 'attachments' }] },
  contractors: { noun: 'contractor', fields: [
    { k: 'company', label: 'Company', req: 1 }, { k: 'trade', label: 'Trade' }, { k: 'contact', label: 'Contact person' }, { k: 'phone', label: 'Phone', type: 'tel' }, { k: 'email', label: 'Email', type: 'email' },
    { k: 'rate', label: 'Rate' }, { k: 'insuranceExpires', label: 'Insurance expires', type: 'date' }, { k: 'notes', label: 'Notes', type: 'textarea', full: 1 }, { k: 'attachments', label: 'Insurance certificate, W-9, contracts', type: 'attachments' }] },
  sow: { noun: 'scope of work', fields: [
    { k: 'title', label: 'Title', req: 1, full: 1 }, { k: 'contractorId', label: 'Contractor', type: 'contractor', req: 1 }, { k: 'projectId', label: 'Project', type: 'project' },
    { k: 'status', label: 'Status', type: 'select', options: E.sowStatus, req: 1 }, { k: 'value', label: 'Contract value ($)', type: 'money' }, { k: 'start', label: 'Start', type: 'date' }, { k: 'end', label: 'Finish', type: 'date' },
    { k: 'body', label: 'Scope (inclusions, exclusions, deliverables)', type: 'markdown', full: 1, rows: 10 }, { k: 'attachments', label: 'Signed documents & drawings', type: 'attachments' }] },
  access: { noun: 'site access window', fields: [
    { k: 'contractorId', label: 'Contractor', type: 'contractor' }, { k: 'who', label: 'Who is on site', req: 1 }, { k: 'from', label: 'From', type: 'date', req: 1 }, { k: 'to', label: 'To', type: 'date' },
    { k: 'hours', label: 'Hours', placeholder: '7:00 AM – 5:00 PM' }, { k: 'areas', label: 'Areas allowed' }, { k: 'badge', label: 'Keys / badge / door codes' }, { k: 'approvedBy', label: 'Approved by' }, { k: 'notes', label: 'Rules & notes', type: 'textarea', full: 1 }] },
  punch: { noun: 'punch item', fields: [
    { k: 'description', label: 'What needs fixing', req: 1, full: 1 }, { k: 'location', label: 'Location' }, { k: 'status', label: 'Status', type: 'select', options: E.punchStatus, req: 1 },
    { k: 'projectId', label: 'Project', type: 'project' }, { k: 'contractorId', label: 'Contractor', type: 'contractor' }, { k: 'due', label: 'Due', type: 'date' }, { k: 'photos', label: 'Photos', type: 'photos' }, { k: 'notes', label: 'Notes', type: 'textarea', full: 1 }] },
  invoices: { noun: 'invoice', fields: [
    { k: 'number', label: 'Invoice number', req: 1 }, { k: 'contractorId', label: 'Contractor', type: 'contractor', req: 1 }, { k: 'projectId', label: 'Project', type: 'project' }, { k: 'amount', label: 'Amount ($)', type: 'money', req: 1 },
    { k: 'date', label: 'Invoice date', type: 'date' }, { k: 'dueDate', label: 'Payment due', type: 'date' }, { k: 'status', label: 'Status', type: 'select', options: E.invoiceStatus, req: 1 }, { k: 'notes', label: 'Notes', type: 'textarea', full: 1 }, { k: 'attachments', label: 'Invoice PDF', type: 'attachments' }] },
  gear: { noun: 'gear item', fields: [
    { k: 'name', label: 'Name', req: 1 }, { k: 'category', label: 'Category', type: 'select', options: E.gearCategory }, { k: 'manufacturer', label: 'Manufacturer' }, { k: 'model', label: 'Model' },
    { k: 'serial', label: 'Serial number' }, { k: 'assetTag', label: 'Asset tag' }, { k: 'status', label: 'Status', type: 'select', options: E.gearStatus, req: 1 }, { k: 'location', label: 'Location' },
    { k: 'firmware', label: 'Firmware version' }, { k: 'firmwareUpdated', label: 'Firmware updated', type: 'date' }, { k: 'ip', label: 'IP address' }, { k: 'mac', label: 'MAC address' },
    { k: 'purchaseDate', label: 'Purchase date', type: 'date' }, { k: 'warranty', label: 'Warranty until', type: 'date' }, { k: 'notes', label: 'Notes', type: 'textarea', full: 1 }] },
  photos: { noun: 'photo', fields: [{ k: 'caption', label: 'Caption', full: 1 }, { k: 'location', label: 'Location' }, { k: 'projectId', label: 'Project', type: 'project' }] },
  webhooks: { noun: 'webhook', fields: [
    { k: 'url', label: 'URL', type: 'url', req: 1, full: 1 }, { k: 'events', label: 'Events', placeholder: '* or tasks.*, comment.created', full: 1 }, { k: 'secret', label: 'Signing secret', help: 'Used for the X-HCC-Signature header.' }, { k: 'active', label: 'Active', type: 'checkbox' }] },
};
const NEW_DEFAULTS = {
  tasks: { status: 'To Do', priority: 'Medium', assignees: [], labels: [], attachments: [] },
  projects: { status: 'Planning', color: '#d4d4d4' }, cables: { status: 'Planned', type: 'Cat6A' }, bom: { status: 'Needed', qty: 1 },
  purchases: { status: 'Draft', lines: [{ desc: '', qty: 1, unitCost: 0, receivedQty: 0 }], attachments: [] }, punch: { status: 'Open', photos: [] },
  invoices: { status: 'Received', attachments: [] }, sow: { status: 'Draft', attachments: [] }, gear: { status: 'In Service', configs: [], photos: [] },
  people: { status: 'Available', roles: [] }, teamRoles: { color: '#a3a3a3' }, webhooks: { active: true, events: '*', secret: '' }, contractors: { attachments: [] },
};
const TBL_COLL = { cables: 'cables', bom: 'bom', pos: 'purchases', sow: 'sow', punch: 'punch', inv: 'invoices', access: 'access', gear: 'gear' };

function poTransform(po) {
  const lines = po.lines || [];
  if (['Ordered', 'Partially Received', 'Received'].includes(po.status) && lines.length) {
    const all = lines.every((l) => num(l.receivedQty) >= num(l.qty));
    const some = lines.some((l) => num(l.receivedQty) > 0);
    po.status = all ? 'Received' : some ? 'Partially Received' : 'Ordered';
    if (all && !po.receivedDate) po.receivedDate = localDate();
  }
  return po;
}

// ======================= Shell =======================
const NAV = [['/', 'Home', 'home', 'viewer'], ['/sops', 'SOPs', 'book', 'public'], ['/roster', 'Roster', 'users', 'viewer'], ['/projects', 'Projects', 'folder', 'viewer'], ['/gear', 'Gear', 'box', 'editor'], ['/contractors', 'Contractors', 'hardhat', 'editor'], ['/purchasing', 'Purchasing', 'cart', 'editor'], ['/notifications', 'Notifications', 'bell', 'viewer'], ['/settings', 'Settings', 'gear', 'admin']];
function shell(body) {
  const r = HC.ROLE_RANK[role()];
  const nav = NAV.filter(([, , , need]) => r >= HC.ROLE_RANK[need]);
  const active = (p) => (p === '/' ? S.route === '/' : S.route.startsWith(p));
  const unread = list('notifications').filter((n) => !n.read).length;
  const badge = (p) => (p === '/notifications' && unread ? `<span class="badge">${unread}</span>` : '');
  const mobile = S.user ? [['/', 'Home', 'home'], ['/sops', 'SOPs', 'book'], ['/projects', 'Projects', 'folder'], ['/notifications', 'Alerts', 'bell']] : [['/sops', 'SOPs', 'book']];
  return `<div class="app ${S.ui.sidebarOpen ? 'nav-open' : ''}">
    ${DEMO ? `<div class="demo-bar"><span><b>Preview</b> · data stays in this browser${S.user ? ` · signed in as ${esc(S.user.name)} (${esc(S.user.role)})` : ' · not signed in'}</span><button class="btn btn-xs" data-click="switchUser">Switch account</button></div>` : ''}
    <aside class="sidebar" aria-label="Main navigation">
      <div class="brand">${brandMark()}<span>${esc(settings().orgName || 'HCC Production')}</span></div>
      <nav class="nav">${nav.map(([p, l, ic]) => `<button class="nav-item ${active(p) ? 'on' : ''}" data-click="go" data-to="${p}">${icon(ic)}<span>${l}</span>${badge(p)}</button>`).join('')}</nav>
      <div class="sidebar-foot">${S.user ? `<button class="me" data-click="go" data-to="/profile">${avatar(S.user.id)}<span><b>${esc(S.user.name)}</b><span class="muted small">${esc(S.user.role)}</span></span></button>` : `<button class="btn btn-primary full-w" data-click="go" data-to="/login">Sign in</button>`}
</div>
    </aside>
    <div class="scrim" data-click="toggleSidebar"></div>
    <div class="main">
      <header class="topbar"><button class="icon-btn" data-click="toggleSidebar" aria-label="Menu">${icon('menu')}</button><div class="brand sm">${brandMark()}<span>${esc(settings().orgName || 'HCC Production')}</span></div><span class="spacer"></span>${list('sops').length ? `<button class="icon-btn" data-click="openSearch" aria-label="Search SOPs">${icon('search')}</button>` : ''}${S.user ? `<button class="icon-btn bell" data-click="go" data-to="/notifications" aria-label="Notifications">${icon('bell')}${unread ? `<span class="badge">${unread}</span>` : ''}</button>` : `<button class="btn btn-sm btn-primary" data-click="go" data-to="/login">Sign in</button>`}</header>
      <main class="content" id="main">${body}</main>
    </div>
    <nav class="bottom-nav" aria-label="Quick navigation">${mobile.map(([p, l, ic]) => `<button class="${active(p) ? 'on' : ''}" data-click="go" data-to="${p}">${icon(ic)}<span>${l}</span>${badge(p)}</button>`).join('')}<button data-click="toggleSidebar">${icon('menu')}<span>More</span></button></nav>
  </div>`;
}

// ======================= Routes =======================
route('/', () => (S.user ? viewHome() : settings().publicSops !== false ? viewSopIndex() : loginView()));
route('/login', () => (S.user && !DEMO ? viewHome() : loginView()), { bare: true });
route('/sops', viewSopIndex);
route('/sops/:id/edit', viewSopEdit, { need: 'editor' });
route('/sops/:id', viewSop);
route('/roster', viewRoster, { need: 'viewer' });
route('/projects', viewProjects, { need: 'viewer' });
route('/projects/:id/report', viewProjectReport, { need: 'editor', bare: true });
route('/projects/:id', viewProject, { need: 'viewer' });
route('/projects/:id/:tab', viewProject, { need: 'viewer' });
route('/projects/:id/:tab/:sub', viewProject, { need: 'editor' });
route('/gear', viewGear, { need: 'editor' });
route('/gear/:id', viewGearItem, { need: 'editor' });
route('/contractors', viewContractors, { need: 'editor' });
route('/contractors/:id', viewContractor, { need: 'editor' });
route('/purchasing', viewPurchasing, { need: 'editor' });
route('/notifications', viewNotifications, { need: 'viewer' });
route('/profile', viewProfile, { need: 'viewer' });
route('/settings', viewSettings, { need: 'admin' });
route('/settings/:tab', viewSettings, { need: 'admin' });

// ======================= Actions =======================
const curProject = () => S.route.split('/')[2];
const formLayer = () => [...LAYERS].reverse().find((l) => l.form);
function renderWidget(key) {
  const l = formLayer(); if (!l) return;
  const w = $(`[data-widget="${key}"]`, l.el);
  if (w) w.innerHTML = attachmentList(l.form.work[key], { removable: true, key });
}
function linkModal(onAdd) {
  const l = openModal({ title: 'Add a link', body: `<form class="form-grid one" data-submit="linkForm"><div class="field"><label class="label" for="lk-url">Link (Google Drive, Dropbox, OneDrive, any URL)</label><input id="lk-url" class="input" type="url" required placeholder="https://"></div><div class="field"><label class="label" for="lk-name">Name</label><input id="lk-name" class="input" placeholder="Shown in the file list"></div><button class="btn btn-primary">Add link</button></form>` });
  l.onLink = onAdd;
}
async function copyText(text, el) {
  try { await navigator.clipboard.writeText(text); toast('Copied'); }
  catch {
    const ta = el?.closest('.modal, .card, .code')?.querySelector('textarea, input[readonly], pre') || null;
    if (ta?.select) { ta.select(); toast('Press Ctrl+C / ⌘C to copy', 'info'); }
    else if (ta) { const r = document.createRange(); r.selectNodeContents(ta); getSelection().removeAllRanges(); getSelection().addRange(r); toast('Selected. Press Ctrl+C / ⌘C to copy', 'info'); }
    else toast('Copy is blocked here. Select the text and copy it manually.', 'info');
  }
}
function checkinModal(person) {
  const l = openModal({ title: person.id === S.user?.personId ? 'Check in' : `Update ${person.name}`, body: `<form class="form-grid one" data-submit="checkinForm"><div class="status-pick">${E.personStatus.map((s) => `<label class="status-opt"><input type="radio" name="status" value="${esc(s)}" ${person.status === s ? 'checked' : ''}><span>${statusDot(s)} ${esc(s)}</span></label>`).join('')}</div><div class="field"><label class="label" for="ci-note">Note (optional)</label><input id="ci-note" class="input" value="${esc(person.statusNote || '')}" placeholder="e.g. In the booth until noon"></div><button class="btn btn-primary btn-lg">Check in now</button></form>` });
  l.personId = person.id;
}
function svgPoint(svg, ev) {
  const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}
const renderLayoutStage = () => { const st = $('.layout-stage'); if (st && LAYOUT) st.innerHTML = layoutSVG(LAYOUT.doc, { sel: LAYOUT.sel }); };

const ACT = {
  go: (el) => { S.ui.sidebarOpen = false; S.ui.docsNav = false; go(el.dataset.to); },
  closeModal, askOk: () => topLayer()?.ok?.(),
  submitTop: () => topLayer()?.submit?.(),
  deleteFromForm: () => topLayer()?.del?.(),
  toggleSidebar: () => { S.ui.sidebarOpen = !S.ui.sidebarOpen; render(); },
  print: printPage,
  copy: (el) => copyText(el.dataset.text, el),
  copyCode: (el) => copyText(el.closest('.code').querySelector('code').textContent, el),
  copyExport: (el) => copyText($('#export-text').value, el),
  scrollTo: (el) => { document.getElementById(el.dataset.target)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
  zoom: (el) => viewFile({ fileId: null, url: null, name: el.alt || 'Image', mime: 'image/png', _src: el.src }),
  viewFile: (el) => viewFile(JSON.parse(el.dataset.json)),

  // generic docs
  newDoc: (el) => {
    const coll = el.dataset.coll;
    const defaults = { ...(NEW_DEFAULTS[coll] || {}) };
    if (el.dataset.project) defaults.projectId = el.dataset.project;
    if (el.dataset.contractor) defaults.contractorId = el.dataset.contractor;
    if (coll === 'access') defaults.approvedBy = S.user?.name;
    if (coll === 'purchases') defaults.date = localDate();
    if (coll === 'invoices') defaults.date = localDate();
    editForm(coll, { id: HC.uid(coll.slice(0, 3)), ...defaults }, { transform: coll === 'purchases' ? poTransform : null });
  },
  editDoc: (el) => {
    const coll = el.dataset.coll || TBL_COLL[el.closest('[data-tbl]')?.dataset.tbl];
    const doc = byId(coll, el.dataset.id);
    if (doc) editForm(coll, doc, { transform: coll === 'purchases' ? poTransform : null });
  },
  viewSow: (el) => { const d = byId('sow', el.dataset.id); if (d) editForm('sow', d); },
  openGear: (el) => go('/gear/' + el.dataset.id),
  sortTable: (el) => { const k = 'tbl_' + el.dataset.table; const st = S.ui[k] || {}; uiSet(k, { ...st, sort: el.dataset.k, dir: st.sort === el.dataset.k && st.dir !== 'desc' ? 'desc' : 'asc' }); render(); },
  exportTable: (el) => { const t = TABLES[el.dataset.table]; if (t) downloadText(t.csv, toCSV(t.rows, t.cols.filter((c) => c.label))); },
  removeAttachment: async (el) => {
    const key = el.dataset.key, i = Number(el.dataset.i);
    if (key.includes(':')) {
      const [kind, id, field = 'attachments'] = key.split(':');
      const coll = kind === 'task' ? 'tasks' : kind;
      const doc = byId(coll, id); if (!doc) return;
      if (!(await ask(`Remove “${doc[field][i]?.name}”?`, { danger: true, ok: 'Remove' }))) return;
      const next = { ...doc, [field]: doc[field].filter((_, j) => j !== i) };
      await save(coll, next, true);
    } else {
      const l = formLayer(); if (!l) return;
      l.form.work[key] = (l.form.work[key] || []).filter((_, j) => j !== i);
      renderWidget(key);
    }
  },
  formAddFiles: async (el) => {
    const l = formLayer(); const key = el.dataset.key;
    const files = await pickFiles({ accept: el.dataset.accept, capture: !!el.dataset.capture });
    const ups = await uploadFiles(files);
    l.form.work[key] = [...(l.form.work[key] || []), ...ups];
    renderWidget(key);
  },
  formAddLink: (el) => { const l = formLayer(); const key = el.dataset.key; linkModal((f) => { l.form.work[key] = [...(l.form.work[key] || []), f]; renderWidget(key); }); },
  addLine: (el) => { el.previousElementSibling.insertAdjacentHTML('beforeend', lineRow({ qty: 1, receivedQty: 0 })); },
  removeLine: (el) => el.closest('.line').remove(),

  // SOPs
  openSearch, searchGo: (el) => { closeModal(); go(el.dataset.to); },
  toggleDocsNav: () => { S.ui.docsNav = !S.ui.docsNav; render(); },
  newSop: () => go(`/sops/${HC.uid('sop')}/edit`),
  sopMode: (el) => { uiSet('sopEditMode', el.dataset.mode); render(); },
  mdInsert: (el) => {
    const ta = $('#sop-body'); const [a, b, c] = MD_SNIPPETS[el.dataset.snip];
    if (!['h2', 'bold', 'list', 'check'].includes(el.dataset.snip)) ta.selectionStart = ta.selectionEnd;
    insertAtCursor(ta, a, b, c);
  },
  mdUpload: async (el) => { const ta = $('#sop-body'); const files = await pickFiles({ accept: el.dataset.accept }); if (files.length) insertMediaFiles(ta, files); },
  saveSop: async (el) => {
    const id = el.dataset.id;
    const title = $('#sop-title').value.trim();
    if (!title) { toast('Give the SOP a title.', 'error'); $('#sop-title').focus(); return; }
    const before = byId('sops', id) || {};
    const doc = { ...before, id, title, description: $('#sop-desc').value.trim(), group: $('#sop-group').value.trim() || 'General', order: num($('#sop-order').value), icon: $('#sop-icon').value.trim() || '•', public: $('#sop-public').checked, body: $('#sop-body').value };
    await save('sops', doc);
    const groups = settings().sopGroups || [];
    if (isAdmin() && !groups.includes(doc.group)) await save('settings', { ...settings(), sopGroups: [...groups, doc.group] }, true);
    go('/sops/' + id);
  },
  deleteSop: async (el) => { if (await removeDoc('sops', el.dataset.id, 'this SOP')) go('/sops'); },

  // projects & tasks
  newProject: () => editForm('projects', { id: HC.uid('proj'), ...NEW_DEFAULTS.projects, start: localDate(), lead: S.user?.id }, { onSaved: (p) => go('/projects/' + p.id) }),
  editProject: (el) => editForm('projects', byId('projects', el.dataset.id), { onSaved: () => {} , deletable: true }),
  taskView: (el) => { uiSet('taskView', el.dataset.view); render(); },
  calMonth: (el) => { uiSet('calMonth', el.dataset.m); render(); },
  tlZoom: (el) => { uiSet('tlZoom', el.dataset.z); render(); },
  calendarSync: (el) => {
    const all = calendarUrl(), proj = calendarUrl(el.dataset.project);
    openModal({ title: 'Sync to your calendar', body: `<p class="small">Subscribe once and due dates stay in sync on your phone. Google Calendar: <b>Other calendars → From URL</b>. iPhone: <b>Settings → Calendar → Accounts → Add Subscribed Calendar</b>. Outlook: <b>Add calendar → Subscribe from web</b>.</p>
      <div class="field"><label class="label">This project</label><div class="row gap-sm"><input class="input mono" readonly value="${esc(proj)}"><button class="btn btn-sm" data-click="copy" data-text="${esc(proj)}">Copy</button></div></div>
      <div class="field"><label class="label">Everything (all projects + site access)</label><div class="row gap-sm"><input class="input mono" readonly value="${esc(all)}"><button class="btn btn-sm" data-click="copy" data-text="${esc(all)}">Copy</button></div></div>${DEMO ? '<p class="small muted">The feed is served by your Docker server once deployed.</p>' : ''}` });
  },
  newTask: (el) => {
    const pid = el.dataset.project || curProject();
    editForm('tasks', { id: HC.uid('tsk'), ...NEW_DEFAULTS.tasks, projectId: pid, status: el.dataset.status || 'To Do', due: el.dataset.due || '', parentId: el.dataset.parent || null }, { onSaved: (t) => go(`/projects/${t.projectId}/tasks/${t.id}`) });
  },
  openTask: (el) => { const t = byId('tasks', el.dataset.id); if (t) go(`/projects/${t.projectId}/tasks/${t.id}`); },
  closeTask: () => go(`/projects/${curProject()}/tasks`),
  deleteTask: async (el) => {
    const t = byId('tasks', el.dataset.id);
    const subs = subtasksOf(t.id);
    if (!(await ask(`Delete “${t.title}”${subs.length ? ` and its ${subs.length} subtask${subs.length > 1 ? 's' : ''}` : ''}?`, { danger: true, ok: 'Delete' }))) return;
    for (const s of subs) { await api.remove('tasks', s.id); drop('tasks', s.id); }
    await api.remove('tasks', t.id); drop('tasks', t.id);
    toast('Task deleted');
    go(t.parentId ? `/projects/${t.projectId}/tasks/${t.parentId}` : `/projects/${t.projectId}/tasks`);
  },
  toggleDone: async (el) => { const t = byId('tasks', el.dataset.id); await save('tasks', { ...t, status: t.status === 'Done' ? 'To Do' : 'Done', completedAt: t.status === 'Done' ? null : new Date().toISOString() }, true); },
  moveTask: async (el) => { const t = byId('tasks', el.dataset.id); await save('tasks', { ...t, status: el.dataset.status }, true); },
  editDesc: (el) => { S.ui.editDesc = el.dataset.id; render(); },
  saveDesc: async (el) => { const t = byId('tasks', el.dataset.id); const v = $('#t-desc-' + t.id).value; S.ui.editDesc = null; await save('tasks', { ...t, description: v }, true); },
  drawerTab: (el) => { uiSet('drawerTab', el.dataset.key); render(); },
  taskUpload: async (el) => {
    const t = byId('tasks', el.dataset.id);
    const files = await pickFiles({ accept: el.dataset.capture ? 'image/*' : '', capture: !!el.dataset.capture });
    const ups = await uploadFiles(files);
    if (ups.length) await save('tasks', { ...byId('tasks', t.id), attachments: [...(byId('tasks', t.id).attachments || []), ...ups] }, true);
  },
  taskLink: (el) => { const id = el.dataset.id; linkModal((f) => { const t = byId('tasks', id); save('tasks', { ...t, attachments: [...(t.attachments || []), f] }, true); }); },
  deleteComment: async (el) => { await removeDoc('comments', el.dataset.id, 'this comment'); },
  exportTasks: (el) => {
    const pid = el.dataset.id;
    const rows = projectTasks(pid);
    downloadText(`tasks-${slugify(byId('projects', pid)?.name)}.csv`, toCSV(rows, [{ k: 'title', label: 'Title' }, { k: 'status', label: 'Status' }, { k: 'priority', label: 'Priority' }, { k: 'a', label: 'Assignees', csv: (t) => (t.assignees || []).map(userName) }, { k: 'start', label: 'Start' }, { k: 'due', label: 'Due' }, { k: 'labels', label: 'Labels' }, { k: 'p', label: 'Parent task', csv: (t) => byId('tasks', t.parentId)?.title || '' }, { k: 'description', label: 'Description' }]));
  },
  cableLabels: (el) => {
    const cables = list('cables').filter((c) => c.projectId === el.dataset.id);
    openModal({ title: 'Cable labels', wide: true, cls: 'printable', body: `<p class="muted small no-print">Print on label stock, one label per cable end.</p><div class="cable-labels">${cables.flatMap((c) => [['A', c.from, c.to], ['B', c.to, c.from]].map(([end, here, there]) => `<div class="cable-label"><b class="mono">${esc(c.label)}-${end}</b><span class="small">${esc(c.type)}</span><span class="small">THIS END: ${esc(here)}</span><span class="small">OTHER END: ${esc(there)}</span></div>`)).join('')}</div>`, foot: `<button class="btn btn-primary" data-click="print">${icon('printer')} Print</button>` });
  },

  // layouts
  newLayout: async (el) => { const d = await save('layouts', { id: HC.uid('lay'), projectId: el.dataset.project, name: 'New layout', width: 1000, height: 640, items: [], runs: [], background: null }); go(`/projects/${d.projectId}/layouts/${d.id}`); },
  deleteLayout: async (el) => { const pid = byId('layouts', el.dataset.id)?.projectId; if (await removeDoc('layouts', el.dataset.id, 'this layout')) { LAYOUT = null; go(`/projects/${pid}/layouts`); } },
  layoutMode: (el) => { LAYOUT.mode = el.dataset.mode; LAYOUT.connectFrom = null; render(); },
  layoutBg: async () => { const [f] = await pickFiles({ accept: 'image/*', multiple: false }); if (!f) return; const [up] = await uploadFiles([f]); if (up) { LAYOUT.doc.background = up.fileId; await saveLayout(); } },
  layoutBgClear: async () => { LAYOUT.doc.background = null; await saveLayout(); },
  layoutDelete: async () => { const d = LAYOUT.doc; d.items = d.items.filter((i) => i.id !== LAYOUT.sel); d.runs = d.runs.filter((r) => r.id !== LAYOUT.sel && r.from !== LAYOUT.sel && r.to !== LAYOUT.sel); LAYOUT.sel = null; await saveLayout(); },

  // budget
  receivePO: (el) => {
    const po = byId('purchases', el.dataset.id);
    const l = openModal({ title: `Receive ${po.poNumber}`, body: `<form class="form-grid one" data-submit="receiveForm"><p class="small muted">${esc(po.vendor)} · enter how many of each line arrived in total.</p>${(po.lines || []).map((ln, i) => `<div class="recv-row"><span class="grow">${esc(ln.desc)} <span class="muted small">× ${ln.qty}</span></span><input id="rv-${i}" class="input input-sm" type="number" step="any" min="0" value="${esc(ln.receivedQty || 0)}" aria-label="Received quantity"><button type="button" class="btn btn-xs" data-click="receiveAllLine" data-i="${i}" data-q="${ln.qty}">All</button></div>`).join('')}<div class="field"><label class="label" for="rv-date">Received on</label><input id="rv-date" class="input" type="date" value="${localDate()}"></div><button class="btn btn-primary">Save receipt</button></form>` });
    l.poId = po.id;
  },
  receiveAllLine: (el) => { $('#rv-' + el.dataset.i).value = el.dataset.q; },

  // photos
  addPhotos: async (el) => {
    const pid = el.dataset.project;
    const files = await pickFiles({ accept: 'image/*,video/*', capture: !!el.dataset.capture });
    const ups = await uploadFiles(files);
    for (const f of ups) await save('photos', { id: HC.uid('pho'), projectId: pid, fileId: f.fileId, name: f.name, mime: f.mime, size: f.size, caption: '', location: S.ui.photoLocDefault || '', takenAt: new Date().toISOString(), by: S.user?.id }, true);
    if (ups.length) toast(`${ups.length} photo${ups.length > 1 ? 's' : ''} added`);
  },
  quickPhoto: () => {
    const ps = list('projects').filter((p) => p.status !== 'Complete');
    openModal({ title: 'Site photo', body: `<div class="field"><label class="label" for="qp-proj">Project</label><select id="qp-proj" class="input">${ps.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div><div class="field"><label class="label" for="qp-loc">Location</label><input id="qp-loc" class="input" placeholder="e.g. Balcony rail" value="${esc(S.ui.photoLocDefault || '')}"></div><div class="row gap-sm"><button class="btn btn-primary" data-click="quickPhotoGo" data-capture="1">${icon('camera')} Take photo</button><button class="btn" data-click="quickPhotoGo">${icon('image')} Upload</button></div>` });
  },
  quickPhotoGo: async (el) => { const pid = $('#qp-proj').value; uiSet('photoLocDefault', $('#qp-loc').value); closeModal(); await ACT.addPhotos({ dataset: { project: pid, capture: el.dataset.capture } }); go(`/projects/${pid}/photos`); },
  exportPhotos: (el) => { const rows = list('photos').filter((x) => x.projectId === el.dataset.id); downloadText('photos.csv', toCSV(rows, [{ k: 'caption', label: 'Caption' }, { k: 'location', label: 'Location' }, { k: 'takenAt', label: 'Taken' }, { k: 'b', label: 'By', csv: (x) => userName(x.by) }, { k: 'u', label: 'URL', csv: (x) => (DEMO ? '' : location.origin) + '/files/' + x.fileId }])); },

  // roster
  checkin: () => { const p = byId('people', S.user?.personId); if (p) checkinModal(p); else toast('Your login is not linked to a roster entry yet.', 'error'); },
  checkinFor: (el) => checkinModal(byId('people', el.dataset.id)),

  // gear
  gearCat: (el) => { uiSet('gearCat', el.dataset.c); render(); },
  gearLabel: (el) => { const g = byId('gear', el.dataset.id); openModal({ title: 'Equipment label', cls: 'printable', body: `<div class="label-sheet">${gearLabelHTML(g)}</div>`, foot: `<button class="btn btn-primary" data-click="print">${icon('printer')} Print label</button>` }); },
  gearConfig: async (el) => {
    const g = byId('gear', el.dataset.id);
    const files = await pickFiles({});
    const ups = (await uploadFiles(files)).map((f) => ({ ...f, firmware: g.firmware || '' }));
    if (ups.length) await save('gear', { ...byId('gear', g.id), configs: [...(byId('gear', g.id).configs || []), ...ups] });
  },
  gearPhoto: async (el) => {
    const g = byId('gear', el.dataset.id);
    const ups = await uploadFiles(await pickFiles({ accept: 'image/*', capture: !!el.dataset.capture }));
    if (ups.length) await save('gear', { ...byId('gear', g.id), photos: [...(byId('gear', g.id).photos || []), ...ups] });
  },

  // account
  demoLogin: async (el) => { await api.login(el.dataset.u); await reload(); go('/'); toast(`Signed in as ${S.user.name}`); },
  switchUser: async () => { await api.logout(); await reload(); go('/login'); },
  logout: async () => { await api.logout(); if (!DEMO) { location.hash = '/'; location.reload(); return; } await reload(); go('/login'); },
  readAll: async () => { await api.readAll(); for (const n of list('notifications')) n.read = true; render(); },
  openNotif: async (el) => { const n = byId('notifications', el.dataset.id); if (!n.read) { n.read = true; api.save('notifications', { id: n.id, read: true }).catch(() => {}); } go(n.link || '/'); },
  genTopic: () => { $('#pf-topic').value = `hcc-${slugify(S.user.username)}-${HC.uid().slice(0, 8)}`; },
  saveTopic: async () => { try { const r = await api.updateMe({ ntfyTopic: $('#pf-topic').value.trim() }); S.user = { ...S.user, ...r.user }; toast('Topic saved'); render(); } catch (e) { toast(e.message, 'error'); } },
  testNotify: async () => { try { await api.testNotify(); toast('Test sent. Check your phone and the bell.'); } catch (e) { toast(e.message, 'error'); } },
  editUser: (el) => {
    const u = (S.adminUsers || []).find((x) => x.id === el.dataset.id) || { role: 'editor' };
    const l = openModal({ title: u.id ? `Edit ${u.name}` : 'New user', body: `<form class="form-grid" data-submit="userForm">
      <div class="field"><label class="label" for="u-username">Username *</label><input id="u-username" class="input" required value="${esc(u.username || '')}" autocapitalize="off"></div>
      <div class="field"><label class="label" for="u-name">Name</label><input id="u-name" class="input" value="${esc(u.name || '')}"></div>
      <div class="field"><label class="label" for="u-email">Email</label><input id="u-email" class="input" type="email" value="${esc(u.email || '')}"></div>
      <div class="field"><label class="label" for="u-role">Role</label><select id="u-role" class="input">${['viewer', 'editor', 'admin'].map((r) => `<option ${u.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
      <div class="field"><label class="label" for="u-person">Roster entry</label><select id="u-person" class="input"><option value="">—</option>${list('people').map((p) => `<option value="${p.id}" ${u.personId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
      <div class="field"><label class="label" for="u-topic">ntfy topic</label><input id="u-topic" class="input mono" value="${esc(u.ntfyTopic || '')}"></div>
      ${!DEMO ? `<div class="field full"><label class="label" for="u-pass">${u.id ? 'Set new password' : 'Password'}</label><input id="u-pass" class="input" type="password" minlength="8" autocomplete="new-password" ${u.id ? '' : 'required'} placeholder="${u.id ? 'Leave blank to keep' : 'At least 8 characters'}"></div>` : ''}
      <div class="row full">${u.id && u.id !== S.user.id ? `<button type="button" class="btn btn-ghost danger-text" data-click="deleteUser" data-id="${u.id}">Delete user</button>` : ''}<span class="spacer"></span><button class="btn btn-primary">${u.id ? 'Save' : 'Create user'}</button></div></form>` });
    l.userId = u.id;
  },
  deleteUser: async (el) => { if (!(await ask('Delete this user? Their tasks stay but show as Unknown.', { danger: true, ok: 'Delete' }))) return; try { await api.deleteUser(el.dataset.id); closeModal(); await reload(); render(); } catch (e) { toast(e.message, 'error'); } },
  newKey: () => openModal({ title: 'New API key', body: `<form class="form-grid one" data-submit="keyForm"><div class="field"><label class="label" for="k-name">Name</label><input id="k-name" class="input" required placeholder="e.g. Zapier, Companion, n8n"></div><div class="field"><label class="label" for="k-role">Access</label><select id="k-role" class="input"><option value="editor">Read & write (editor)</option><option value="viewer">Read only (viewer)</option></select></div><button class="btn btn-primary">Create key</button></form>` }),
  deleteKey: async (el) => { if (await ask('Revoke this key? Anything using it stops working.', { danger: true, ok: 'Revoke' })) { await api.deleteKey(el.dataset.id); loadKeys(); } },
  testIntegrations: async () => { try { await api.testIntegrations(); toast('Test sent to Slack, Teams, ntfy and webhooks'); } catch (e) { toast(e.message, 'error'); } },
  rotateCal: async () => { if (await ask('Reset the calendar link? Existing subscriptions stop updating.', { ok: 'Reset' })) await save('settings', { ...settings(), calendarToken: HC.uid('cal') }); },
  resetDemo: async () => { if (await ask('Reset all demo data in this browser?', { danger: true, ok: 'Reset' })) LocalAPI.reset(); },
  mentionPick: (el) => {
    const pop = el.closest('.mention-pop'); const ta = document.getElementById(pop.dataset.for);
    const pos = ta.selectionStart; const before = ta.value.slice(0, pos).replace(/@([\w.-]*)$/, `@${el.dataset.u} `);
    ta.value = before + ta.value.slice(pos); pop.hidden = true; ta.focus(); ta.setSelectionRange(before.length, before.length);
  },
};

const SUBMIT = {
  submitForm: () => topLayer()?.submit?.(),
  login: async (form) => {
    try { await api.login($('#login-u').value.trim(), $('#login-p').value); await reload(); startLive(); go('/'); }
    catch (e) { toast(e.message, 'error'); }
  },
  linkForm: () => { const l = topLayer(); const url = $('#lk-url').value.trim(); const f = { url, name: $('#lk-name').value.trim() || linkKind(url) + ' link', at: new Date().toISOString() }; closeModal(); l.onLink(f); },
  quickTask: async (form) => { const inp = $('#quick-task'); const title = inp.value.trim(); if (!title) return; inp.value = ''; inp.dataset.fresh = '1'; await save('tasks', { id: HC.uid('tsk'), ...NEW_DEFAULTS.tasks, projectId: form.dataset.project, title }, true); delete $('#quick-task')?.dataset.fresh; $('#quick-task')?.focus(); },
  addSubtask: async (form) => {
    const parent = byId('tasks', form.dataset.id); const inp = form.querySelector('input'); const title = inp.value.trim(); if (!title) return;
    inp.value = '';
    await save('tasks', { id: HC.uid('tsk'), ...NEW_DEFAULTS.tasks, projectId: parent.projectId, parentId: parent.id, title, labels: [...(parent.labels || [])] }, true);
    $(`#sub-new-${parent.id}`)?.focus();
  },
  postComment: async (form) => {
    const ta = form.querySelector('textarea'); const body = ta.value.trim(); if (!body) return;
    ta.value = '';
    await save('comments', { id: HC.uid('cmt'), target: form.dataset.target, body, authorId: S.user.id, authorName: S.user.name, createdAt: new Date().toISOString() }, true);
  },
  firmwareUpdate: async (form) => {
    const g = byId('gear', form.dataset.id); const v = $('#fw-new').value.trim(); if (!v) return;
    $('#fw-new').value = '';
    await save('gear', { ...g, firmware: v, firmwareUpdated: localDate(), firmwareHistory: [...(g.firmwareHistory || []), { from: g.firmware, to: v, at: new Date().toISOString(), by: S.user.id }] });
  },
  saveProfile: async () => {
    try {
      const b = { name: $('#pf-name').value.trim(), email: $('#pf-email').value.trim() };
      if ($('#pf-new')?.value) { b.currentPassword = $('#pf-cur').value; b.newPassword = $('#pf-new').value; }
      const r = await api.updateMe(b); S.user = { ...S.user, ...r.user }; await reload(); toast('Profile saved'); render();
    } catch (e) { toast(e.message, 'error'); }
  },
  saveSettings: async (form) => {
    const fd = new FormData(form); const next = { ...settings() };
    for (const [k, v] of fd.entries()) next[k] = v;
    if ($('#st-pub', form)) next.publicSops = $('#st-pub', form).checked;
    if (fd.has('sopGroups')) next.sopGroups = String(fd.get('sopGroups')).split('\n').map((s) => s.trim()).filter(Boolean);
    if (fd.has('reminderHours')) next.reminderHours = num(fd.get('reminderHours'));
    await save('settings', next);
  },
  checkinForm: async (form) => {
    const l = topLayer(); const status = new FormData(form).get('status');
    if (!status) return toast('Pick a status.', 'error');
    try { const p = await api.checkin(status, $('#ci-note').value.trim(), l.personId); upsert('people', p); closeModal(); toast(`Checked in: ${status}`); render(); } catch (e) { toast(e.message, 'error'); }
  },
  receiveForm: async (form) => {
    const l = topLayer(); const po = byId('purchases', l.poId);
    const lines = po.lines.map((ln, i) => ({ ...ln, receivedQty: num($('#rv-' + i).value) }));
    const next = poTransform({ ...po, lines, status: po.status === 'Approved' || po.status === 'Submitted' ? 'Ordered' : po.status, receivedDate: $('#rv-date').value });
    await save('purchases', next);
    for (const ln of lines) {
      if (num(ln.receivedQty) < num(ln.qty)) continue;
      const b = list('bom').find((x) => x.projectId === po.projectId && x.item.toLowerCase() === ln.desc.toLowerCase() && ['Needed', 'Quoted', 'Ordered'].includes(x.status));
      if (b) await save('bom', { ...b, status: 'Received' }, true);
    }
    closeModal();
  },
  userForm: async () => {
    const l = topLayer();
    const u = { id: l.userId, username: $('#u-username').value.trim(), name: $('#u-name').value.trim(), email: $('#u-email').value.trim(), role: $('#u-role').value, personId: $('#u-person').value || null, ntfyTopic: $('#u-topic').value.trim() };
    if ($('#u-pass')?.value) u.password = $('#u-pass').value;
    try {
      const saved = await api.saveUser(u);
      if (u.personId) { const p = byId('people', u.personId); if (p && p.userId !== saved.id) await save('people', { ...p, userId: saved.id }, true); }
      closeModal(); await reload(); render(); toast('User saved');
    } catch (e) { toast(e.message, 'error'); }
  },
  keyForm: async () => {
    try {
      const r = await api.createKey({ name: $('#k-name').value.trim(), role: $('#k-role').value });
      closeModal();
      openModal({ title: 'Copy your API key', body: `<p class="small">This is the only time the key is shown. Store it somewhere safe.</p><div class="row gap-sm"><input class="input mono" readonly value="${esc(r.token)}"><button class="btn btn-sm" data-click="copy" data-text="${esc(r.token)}">Copy</button></div>` });
      loadKeys();
    } catch (e) { toast(e.message, 'error'); }
  },
};

const INPUT = {
  tableSearch: (el) => { const k = 'tbl_' + el.dataset.table; S.ui[k] = { ...(S.ui[k] || {}), q: el.value }; render(); },
  sopPreview: () => updateSopPreview(),
  sopSearch: (el) => runSopSearch(el.value),
  taskFilter: (el) => { uiSet('taskFilter', { ...taskFilters(), [el.dataset.k]: el.value }); render(); },
  filterConfig: (el) => { const q = el.value.toLowerCase(); for (const row of $$('#cfg-view .cl')) row.hidden = q && !row.textContent.toLowerCase().includes(q); },
  mentionInput: (el) => {
    const pop = el.parentElement.querySelector('.mention-pop');
    const m = el.value.slice(0, el.selectionStart).match(/(?:^|\s)@([\w.-]*)$/);
    if (!m) { pop.hidden = true; return; }
    const q = m[1].toLowerCase();
    const hits = S.users.filter((u) => u.username.toLowerCase().startsWith(q) || u.name.toLowerCase().includes(q)).slice(0, 6);
    pop.dataset.for = el.id;
    pop.innerHTML = hits.map((u) => `<button type="button" data-click="mentionPick" data-u="${esc(u.username)}">${avatar(u.id, 'xs')} <b>${esc(u.name)}</b> <span class="muted small">@${esc(u.username)}</span></button>`).join('');
    pop.hidden = !hits.length;
  },
};

const CHANGE = {
  taskFilter: (el) => { uiSet('taskFilter', { ...taskFilters(), [el.dataset.k]: el.type === 'checkbox' ? el.checked : el.value }); render(); },
  taskField: async (el) => {
    const t = byId('tasks', el.dataset.id); const k = el.dataset.k;
    let v = el.value;
    if (k === 'labels') v = v.split(',').map((s) => s.trim()).filter(Boolean);
    if (k === 'title') { v = v.trim(); if (!v) return; }
    const next = { ...t, [k]: v };
    if (k === 'status') next.completedAt = v === 'Done' ? new Date().toISOString() : null;
    if (k === 'due') { next.reminderSent = false; next.overdueNotified = false; }
    await save('tasks', next, true);
  },
  taskAssign: async (el) => {
    const t = byId('tasks', el.dataset.id);
    const set = new Set(t.assignees || []);
    if (el.checked) set.add(el.value); else set.delete(el.value);
    await save('tasks', { ...t, assignees: [...set] }, true);
  },
  layoutName: async (el) => { LAYOUT.doc.name = el.value.trim() || 'Layout'; await saveLayout(); },
  layoutAdd: async (el) => {
    const type = el.value; if (!type) return;
    const d = LAYOUT.doc; const n = d.items.filter((i) => i.type === type).length + 1;
    const item = type === 'zone' ? { id: HC.uid('z'), type, label: 'ROOM', x: d.width / 2 - 100, y: d.height / 2 - 60, w: 200, h: 120 } : { id: HC.uid('d'), type, label: `${DEVICE_TYPES[type][0]} ${n}`, x: d.width / 2 + (n % 5) * 20, y: d.height / 2 + (n % 3) * 20 };
    d.items.push(item); LAYOUT.sel = item.id;
    await saveLayout();
  },
  layoutProp: async (el) => {
    const d = LAYOUT.doc; const it = d.items.find((i) => i.id === LAYOUT.sel) || d.runs.find((r) => r.id === LAYOUT.sel);
    if (!it) return;
    it[el.dataset.k] = el.value;
    if (el.dataset.k === 'cableId' && el.value) { const c = byId('cables', el.value); if (c) { it.label = c.label; it.color = ['#f5f5f5', '#d4d4d4', '#a3a3a3', '#8a8a8a'][hue(c.type) % 4]; } }
    await saveLayout();
  },
  photoLoc: (el) => { uiSet('photoLoc', el.value); render(); },
  photoLocDefault: (el) => uiSet('photoLocDefault', el.value),
};

// ======================= Event wiring =======================
document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-click]');
  if (!el || el.disabled) return;
  const fn = ACT[el.dataset.click];
  if (!fn) return;
  if (el.tagName === 'A' && el.dataset.click !== 'go') return;
  ev.preventDefault();
  Promise.resolve(fn(el, ev)).catch((e) => { console.error(e); toast(e.message || 'Something went wrong', 'error'); });
});
document.addEventListener('submit', (ev) => {
  const form = ev.target.closest('[data-submit]');
  if (!form) return;
  ev.preventDefault();
  Promise.resolve(SUBMIT[form.dataset.submit]?.(form, ev)).catch((e) => toast(e.message, 'error'));
});
document.addEventListener('input', (ev) => { const el = ev.target.closest('[data-input]'); if (el) INPUT[el.dataset.input]?.(el, ev); });
document.addEventListener('change', (ev) => { const el = ev.target.closest('[data-change]'); if (el) Promise.resolve(CHANGE[el.dataset.change]?.(el, ev)).catch((e) => toast(e.message, 'error')); });
document.addEventListener('keydown', (ev) => {
  if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'k' && list('sops').length) { ev.preventDefault(); if (!$('.search-modal')) openSearch(); }
  if (ev.key === 'Escape') { if (LAYERS.length) closeModal(); else if (/\/tasks\/[^/]+$/.test(S.route)) ACT.closeTask(); }
  if (ev.key === 'Enter' && ev.target.classList?.contains('title-input')) { ev.preventDefault(); ev.target.blur(); }
  if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey) && ev.target.closest?.('.composer')) { ev.preventDefault(); ev.target.closest('form').requestSubmit(); }
});

// Paste / drop media into markdown fields
async function mediaIntoTextarea(ta, files) {
  const media = [...files];
  if (!media.length) return;
  await insertMediaFiles(ta, media);
}
document.addEventListener('paste', (ev) => {
  const ta = ev.target.closest?.('[data-md-upload]');
  if (ta && ev.clipboardData?.files?.length) { ev.preventDefault(); mediaIntoTextarea(ta, ev.clipboardData.files); }
});

// Drag & drop: board cards + files into textareas
let dragId = null;
document.addEventListener('dragstart', (ev) => { const c = ev.target.closest?.('[data-drag-id]'); if (c) { dragId = c.dataset.dragId; ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', dragId); c.classList.add('dragging'); } });
document.addEventListener('dragend', () => { dragId = null; $$('.dragging, .drop-on').forEach((e) => e.classList.remove('dragging', 'drop-on')); });
document.addEventListener('dragover', (ev) => {
  const col = ev.target.closest?.('[data-drop-status]');
  if (col && dragId) { ev.preventDefault(); $$('.drop-on').forEach((e) => e !== col && e.classList.remove('drop-on')); col.classList.add('drop-on'); return; }
  if (ev.target.closest?.('[data-md-upload]') && ev.dataTransfer?.types?.includes('Files')) ev.preventDefault();
});
document.addEventListener('drop', async (ev) => {
  const col = ev.target.closest?.('[data-drop-status]');
  if (col && dragId) {
    ev.preventDefault();
    const t = byId('tasks', dragId); const status = col.dataset.dropStatus;
    const cards = [...col.querySelectorAll('[data-drag-id]')];
    const after = cards.find((c) => ev.clientY < c.getBoundingClientRect().top + c.offsetHeight / 2);
    const order = after ? (byId('tasks', after.dataset.dragId)?.order ?? 0) - 0.5 : cards.length + 1;
    dragId = null;
    if (t && (t.status !== status || t.order !== order)) await save('tasks', { ...t, status, order, completedAt: status === 'Done' ? new Date().toISOString() : null }, true);
    return;
  }
  const ta = ev.target.closest?.('[data-md-upload]');
  if (ta && ev.dataTransfer?.files?.length) { ev.preventDefault(); mediaIntoTextarea(ta, ev.dataTransfer.files); }
});

// Room layout editor pointer handling
let LDRAG = null;
document.addEventListener('pointerdown', (ev) => {
  const svg = ev.target.closest?.('#layout-svg');
  if (!svg || !LAYOUT) return;
  const p = svgPoint(svg, ev);
  const rz = ev.target.closest('[data-resize]');
  const item = ev.target.closest('[data-item]');
  const run = ev.target.closest('[data-run]');
  if (rz) { const z = LAYOUT.doc.items.find((i) => i.id === rz.dataset.resize); LDRAG = { kind: 'resize', z, ox: p.x - z.w, oy: p.y - z.h, moved: false }; ev.preventDefault(); return; }
  if (item) {
    const it = LAYOUT.doc.items.find((i) => i.id === item.dataset.item);
    if (LAYOUT.mode === 'connect' && it.type !== 'zone') {
      if (!LAYOUT.connectFrom) { LAYOUT.connectFrom = it.id; LAYOUT.sel = it.id; render(); return; }
      if (LAYOUT.connectFrom !== it.id) {
        const r = { id: HC.uid('r'), from: LAYOUT.connectFrom, to: it.id, label: '', color: '#a3a3a3', style: 'straight' };
        LAYOUT.doc.runs.push(r); LAYOUT.sel = r.id; LAYOUT.connectFrom = null; LAYOUT.mode = 'move';
        saveLayout();
      }
      return;
    }
    LDRAG = { kind: 'move', it, ox: p.x - it.x, oy: p.y - it.y, moved: false };
    if (LAYOUT.sel !== it.id) { LAYOUT.sel = it.id; LDRAG.reselect = true; }
    ev.preventDefault();
    renderLayoutStage();
    return;
  }
  if (run) { LAYOUT.sel = run.dataset.run; render(); return; }
  if (LAYOUT.sel) { LAYOUT.sel = null; render(); }
});
document.addEventListener('pointermove', (ev) => {
  if (!LDRAG) return;
  const svg = $('#layout-svg'); if (!svg) return;
  const p = svgPoint(svg, ev);
  const d = LAYOUT.doc;
  const snap = (v) => Math.round(v / 10) * 10;
  if (LDRAG.kind === 'move') { LDRAG.it.x = Math.max(0, Math.min(d.width, snap(p.x - LDRAG.ox))); LDRAG.it.y = Math.max(0, Math.min(d.height, snap(p.y - LDRAG.oy))); }
  else { LDRAG.z.w = Math.max(40, snap(p.x - LDRAG.ox)); LDRAG.z.h = Math.max(30, snap(p.y - LDRAG.oy)); }
  LDRAG.moved = true; LAYOUT.dirty = true;
  renderLayoutStage();
});
document.addEventListener('pointerup', () => {
  if (!LDRAG) return;
  const moved = LDRAG.moved, reselect = LDRAG.reselect;
  LDRAG = null;
  if (moved) saveLayout(); else if (reselect) render();
});

// ======================= Boot =======================
async function reload() {
  const b = await api.boot();
  S.user = b.user; S.users = b.users || []; S.data = b.data || {};
}
let live = false;
function startLive() { if (live || !S.user) return; live = true; api.subscribe(onRemote); }
async function boot() {
  if (!DEMO) {
    try { const r = await fetch('/api/health'); if (!r.ok) throw new Error(); }
    catch { window.HCC_DEMO = true; DEMO = true; api = LocalAPI; }
  }
  if (api === LocalAPI) await LocalAPI.init();
  const isDemo = api === LocalAPI;
  S.route = isDemo ? store.get('hcc-demo-route', '/') : location.hash.slice(1) || '/';
  try { await reload(); } catch (e) { $('#app').innerHTML = `<div class="empty"><h3>Cannot reach the server</h3><p>${esc(e.message)}</p></div>`; return; }
  if (isDemo && !S.user && S.route === '/') S.route = '/login';
  startLive();
  S.booted = true;
  render();
  // Refresh relative times once a minute when nothing is being edited.
  setInterval(() => { const a = document.activeElement; if (!LAYERS.length && !LDRAG && !(a && /INPUT|TEXTAREA|SELECT/.test(a.tagName))) render(); }, 60000);
}
boot();
