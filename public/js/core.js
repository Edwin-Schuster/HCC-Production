'use strict';
/* Core: helpers, backends (server + in-browser demo), state, rendering, modals, forms, markdown. */
const HC = window.HCC;
let DEMO = !!window.HCC_DEMO;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const localDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDay = (s) => new Date(s + 'T00:00:00');
const addDays = (s, n) => { const d = parseDay(s); d.setDate(d.getDate() + n); return localDate(d); };
const daysBetween = (a, b) => Math.round((parseDay(b) - parseDay(a)) / 864e5);
const money = (n) => '$' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const num = (v) => { const n = parseFloat(String(v ?? '').replace(/[$,]/g, '')); return Number.isFinite(n) ? n : 0; };
function fmtDate(d, withYear) {
  if (!d) return '';
  const x = d.length === 10 ? parseDay(d) : new Date(d);
  const yr = withYear || x.getFullYear() !== new Date().getFullYear();
  return x.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(yr ? { year: 'numeric' } : {}) });
}
function ago(iso) {
  if (!iso) return 'never';
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return fmtDate(iso);
}
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const initials = (name) => String(name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
function hue(str) { let h = 0; for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }

// ======================= Backends =======================
function xhrUpload(url, file, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', url);
    x.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    x.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    x.onload = () => { let j; try { j = JSON.parse(x.responseText); } catch { j = {}; } x.status < 300 ? resolve(j) : reject(new Error(j.error || 'Upload failed')); };
    x.onerror = () => reject(new Error('Upload failed. Check your connection.'));
    x.send(file);
  });
}

const ServerAPI = {
  mode: 'server',
  async req(method, url, body) {
    const r = await fetch(url, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
    if (!r.ok) throw new Error(j?.error || r.statusText);
    return j;
  },
  boot() { return this.req('GET', '/api/bootstrap'); },
  login(u, p) { return this.req('POST', '/api/login', { username: u, password: p }); },
  logout() { return this.req('POST', '/api/logout'); },
  save(coll, doc) { return this.req('PUT', `/api/c/${coll}/${encodeURIComponent(doc.id)}`, doc); },
  remove(coll, id) { return this.req('DELETE', `/api/c/${coll}/${encodeURIComponent(id)}`); },
  async get(coll, id) { try { return await this.req('GET', `/api/c/${coll}/${encodeURIComponent(id)}`); } catch { return null; } },
  list(coll) { return this.req('GET', `/api/c/${coll}`); },
  upload(file, opts = {}, onProgress) { return xhrUpload(`/api/files?name=${encodeURIComponent(file.name || 'file')}${opts.public ? '&public=1' : ''}`, file, onProgress); },
  fileUrl(id) { return '/files/' + id; },
  async fileText(id) { const r = await fetch('/files/' + id); return r.text(); },
  checkin(status, note, personId) { return this.req('POST', '/api/checkin', { status, note, personId }); },
  updateMe(b) { return this.req('PUT', '/api/me', b); },
  readAll() { return this.req('POST', '/api/notifications/read-all'); },
  testNotify() { return this.req('POST', '/api/test-notify'); },
  listUsers() { return this.req('GET', '/api/users'); },
  saveUser(u) { return this.req('PUT', `/api/users/${encodeURIComponent(u.id || '')}`, u); },
  deleteUser(id) { return this.req('DELETE', `/api/users/${id}`); },
  listKeys() { return this.req('GET', '/api/apikeys'); },
  createKey(b) { return this.req('POST', '/api/apikeys', b); },
  deleteKey(id) { return this.req('DELETE', `/api/apikeys/${id}`); },
  testIntegrations() { return this.req('POST', '/api/webhooks/test'); },
  subscribe(cb) {
    if (!window.EventSource) return;
    let es;
    const open = () => {
      es = new EventSource('/api/events');
      es.onmessage = (e) => { try { cb(JSON.parse(e.data)); } catch { /* ignore */ } };
      es.onerror = () => { es.close(); setTimeout(open, 5000); };
    };
    open();
  },
};

// In-browser demo backend: same API, data in localStorage, files in IndexedDB.
const DEMO_USERS = [
  { id: 'usr_admin', username: 'edwin', name: 'Edwin Schuster', role: 'admin', personId: 'per_edwin', email: 'ewschuster03@gmail.com', ntfyTopic: '' },
  { id: 'usr_maria', username: 'maria', name: 'Maria Lopez', role: 'editor', personId: 'per_maria', email: 'maria@example.org', ntfyTopic: '' },
  { id: 'usr_james', username: 'james', name: 'James Carter', role: 'editor', personId: 'per_james', email: 'james@example.org', ntfyTopic: '' },
  { id: 'usr_viewer', username: 'staff', name: 'Church Staff (viewer)', role: 'viewer', personId: null, email: '', ntfyTopic: '' },
];
const LocalAPI = {
  mode: 'demo',
  KEY: 'hcc-demo-v2',
  db: null, me: null, listeners: [], blobUrls: new Map(), idb: null, keys: [],
  persist() { store.set(this.KEY, this.db); store.set(this.KEY + '-me', this.me?.id || null); store.set(this.KEY + '-users', DEMO_USERS); store.set(this.KEY + '-keys', this.keys); },
  async init() {
    this.db = store.get(this.KEY, null);
    if (!this.db) {
      const now = new Date().toISOString();
      this.db = HC.seed('usr_admin');
      for (const docs of Object.values(this.db)) for (const d of docs) { d.createdAt ||= now; d.updatedAt ||= now; }
    }
    const savedUsers = store.get(this.KEY + '-users', null);
    if (savedUsers) { DEMO_USERS.length = 0; DEMO_USERS.push(...savedUsers); }
    this.keys = store.get(this.KEY + '-keys', []);
    const meId = store.get(this.KEY + '-me', null);
    this.me = DEMO_USERS.find((u) => u.id === meId) || null;
    await this.openFiles();
    this.persist();
  },
  openFiles() {
    return new Promise((resolve) => {
      try {
        const req = indexedDB.open('hcc-demo-files', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('files');
        req.onsuccess = () => {
          this.idb = req.result;
          try {
            const tx = this.idb.transaction('files').objectStore('files').openCursor();
            tx.onsuccess = (e) => { const c = e.target.result; if (c) { this.blobUrls.set(c.key, URL.createObjectURL(c.value)); c.continue(); } else resolve(); };
            tx.onerror = () => resolve();
          } catch { resolve(); }
        };
        req.onerror = () => resolve();
      } catch { resolve(); }
    });
  },
  role() { return this.me?.role || 'public'; },
  readable(coll) {
    const role = this.role();
    const all = this.db[coll] || [];
    if (coll === 'settings') return all.map((d) => HC.redact(role, coll, d));
    if (coll === 'notifications') return this.me ? all.filter((n) => n.userId === this.me.id) : [];
    if (!HC.can(role, coll, 'read')) return null;
    return all.map((d) => HC.redact(role, coll, d)).filter(Boolean);
  },
  async boot() {
    const data = {};
    for (const c of Object.keys(HC.ACCESS)) { const d = this.readable(c); if (d) data[c] = d; }
    return { user: this.me, users: this.me ? DEMO_USERS.map((u) => ({ ...u })) : [], data };
  },
  async login(username) {
    const u = DEMO_USERS.find((x) => x.username === username);
    if (!u) throw new Error('Pick a demo account.');
    this.me = u; this.persist(); return { user: u };
  },
  async logout() { this.me = null; this.persist(); },
  emit(coll, id, op) { for (const f of this.listeners) setTimeout(() => f({ coll, id, op }), 0); },
  raw(coll, doc) {
    const arr = this.db[coll] || (this.db[coll] = []);
    const i = arr.findIndex((d) => d.id === doc.id);
    if (i >= 0) arr[i] = doc; else arr.push(doc);
    this.persist(); this.emit(coll, doc.id, 'put');
    return doc;
  },
  engine() {
    const self = this;
    return {
      now: () => new Date().toISOString(),
      get: async (c, id) => (self.db[c] || []).find((d) => d.id === id) || null,
      users: async () => DEMO_USERS,
      put: async (c, d) => self.raw(c, d),
      notify: async (userId, n) => { self.raw('notifications', { id: HC.uid('ntf'), userId, ...n, read: false, at: new Date().toISOString() }); },
      channel: async () => {},
    };
  },
  async save(coll, doc) {
    const role = this.role();
    if (coll === 'notifications') { const b = (this.db.notifications || []).find((n) => n.id === doc.id); return this.raw(coll, { ...b, read: !!doc.read }); }
    if (!HC.can(role, coll, 'write')) throw new Error('You do not have permission for this.');
    const before = (this.db[coll] || []).find((d) => d.id === doc.id) || null;
    const now = new Date().toISOString();
    const d = coll === 'settings' ? { ...before, ...doc, id: 'global', updatedAt: now } : { ...doc, createdAt: before?.createdAt || doc.createdAt || now, createdBy: before?.createdBy || this.me.id, updatedAt: now, updatedBy: this.me.id };
    this.raw(coll, d);
    await HC.afterWrite(this.engine(), coll, before ? JSON.parse(JSON.stringify(before)) : null, d, this.me);
    return d;
  },
  async remove(coll, id) {
    if (!HC.can(this.role(), coll, 'write') && coll !== 'notifications') throw new Error('You do not have permission for this.');
    this.db[coll] = (this.db[coll] || []).filter((d) => d.id !== id); this.persist(); this.emit(coll, id, 'delete');
  },
  async get(coll, id) { return (this.readable(coll) || []).find((d) => d.id === id) || null; },
  async list(coll) { return this.readable(coll) || []; },
  async upload(file, opts, onProgress) {
    const id = HC.uid('f').replace(/_/g, '');
    this.blobUrls.set(id, URL.createObjectURL(file));
    try { this.idb?.transaction('files', 'readwrite').objectStore('files').put(file, id); } catch { /* memory only */ }
    onProgress?.(1);
    return { id, name: file.name || 'file', mime: file.type || 'application/octet-stream', size: file.size };
  },
  fileUrl(id) { return this.blobUrls.get(id) || ''; },
  async fileText(id) { const u = this.blobUrls.get(id); if (!u) throw new Error('File not found in this browser.'); return (await fetch(u)).text(); },
  async checkin(status, note, personId) {
    const pid = HC.ROLE_RANK[this.role()] >= 2 && personId ? personId : this.me?.personId;
    const p = (this.db.people || []).find((x) => x.id === pid);
    if (!p) throw new Error('Your account is not linked to a roster entry. Ask an admin to link it.');
    return this.raw('people', { ...p, status, statusNote: note || '', lastCheckIn: new Date().toISOString() });
  },
  async updateMe(b) { Object.assign(this.me, { name: b.name ?? this.me.name, email: b.email ?? this.me.email, ntfyTopic: b.ntfyTopic ?? this.me.ntfyTopic }); this.persist(); return { user: this.me }; },
  async readAll() { for (const n of this.db.notifications || []) if (n.userId === this.me.id) n.read = true; this.persist(); this.emit('notifications', '*', 'put'); },
  async testNotify() { await this.engine().notify(this.me.id, { title: 'Test notification', body: 'In the deployed app this also goes to your phone through ntfy.', link: '/notifications' }); },
  async listUsers() { return DEMO_USERS; },
  async saveUser(u) {
    const id = u.id || HC.uid('usr');
    const i = DEMO_USERS.findIndex((x) => x.id === id);
    const doc = { ...(DEMO_USERS[i] || {}), ...u, id }; delete doc.password;
    if (i >= 0) DEMO_USERS[i] = doc; else DEMO_USERS.push(doc);
    this.persist(); return doc;
  },
  async deleteUser(id) { const i = DEMO_USERS.findIndex((x) => x.id === id); if (i >= 0) DEMO_USERS.splice(i, 1); this.persist(); },
  async listKeys() { return this.keys; },
  async createKey(b) { const token = 'hcc_demo_' + HC.uid().slice(0, 12); const k = { id: HC.uid('key'), name: b.name, role: b.role, prefix: token.slice(0, 10), created_at: new Date().toISOString() }; this.keys.push(k); this.persist(); return { ...k, token }; },
  async deleteKey(id) { this.keys = this.keys.filter((k) => k.id !== id); this.persist(); },
  async testIntegrations() { throw new Error('Slack, Teams and webhooks send from the server. They work once deployed with Docker.'); },
  subscribe(cb) { this.listeners.push(cb); },
  reset() { try { localStorage.removeItem(this.KEY); localStorage.removeItem(this.KEY + '-users'); indexedDB.deleteDatabase('hcc-demo-files'); } catch { /* ignore */ } location.reload(); },
};

let api = DEMO ? LocalAPI : ServerAPI;

// ======================= State =======================
const S = { user: null, users: [], data: {}, route: '/', ui: store.get('hcc-ui', {}), booted: false };
const list = (coll) => S.data[coll] || [];
const byId = (coll, id) => list(coll).find((d) => d.id === id);
const role = () => S.user?.role || 'public';
const isEditor = () => HC.ROLE_RANK[role()] >= 2;
const isAdmin = () => role() === 'admin';
const settings = () => byId('settings', 'global') || {};
const userName = (id) => S.users.find((u) => u.id === id)?.name || (id ? 'Unknown' : '');
const uiSet = (k, v) => { S.ui[k] = v; store.set('hcc-ui', S.ui); };

function upsert(coll, doc) {
  const arr = S.data[coll] || (S.data[coll] = []);
  const i = arr.findIndex((d) => d.id === doc.id);
  if (i >= 0) arr[i] = doc; else arr.push(doc);
}
function drop(coll, id) { S.data[coll] = list(coll).filter((d) => d.id !== id); }

async function save(coll, doc, quiet) {
  if (!doc.id) doc.id = HC.uid(coll.slice(0, 3));
  try {
    const saved = await api.save(coll, doc);
    upsert(coll, saved);
    if (!quiet) toast('Saved');
    render();
    return saved;
  } catch (e) { toast(e.message, 'error'); throw e; }
}
async function removeDoc(coll, id, label) {
  if (!(await ask(`Delete ${label || 'this item'}? This cannot be undone.`, { danger: true, ok: 'Delete' }))) return false;
  try { await api.remove(coll, id); drop(coll, id); toast('Deleted'); render(); return true; } catch (e) { toast(e.message, 'error'); return false; }
}

let pendingRender = null;
async function onRemote({ coll, id, op }) {
  try {
    if (id === '*') S.data[coll] = await api.list(coll);
    else if (op === 'delete') drop(coll, id);
    else { const d = await api.get(coll, id); if (d) upsert(coll, d); else drop(coll, id); }
    if (coll === 'notifications' && op === 'put' && id !== '*') {
      const n = byId('notifications', id);
      if (n && !n.read && Date.now() - new Date(n.at) < 15000) toast(`${n.title}: ${n.body}`, 'info', n.link);
    }
  } catch { /* ignore */ }
  clearTimeout(pendingRender);
  pendingRender = setTimeout(render, 120);
}

// ======================= Router =======================
const ROUTES = []; // filled by main.js: [pattern, viewFn, opts]
function route(pattern, view, opts = {}) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  ROUTES.push({ re, keys, view, opts });
}
function matchRoute(path) {
  for (const r of ROUTES) {
    const m = path.match(r.re);
    if (m) { const params = {}; r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1]))); return { ...r, params }; }
  }
  return { view: () => emptyState('Page not found', 'That page does not exist.', '<button class="btn" data-click="go" data-to="/">Go home</button>'), params: {}, opts: {} };
}
function go(path, replace) {
  if (path === S.route) return render();
  const prevBase = S.route.split('/').slice(0, 3).join('/');
  S.route = path;
  if (!DEMO) { const h = '#' + path; if (replace) history.replaceState(null, '', h); else if (location.hash !== h) history.pushState(null, '', h); }
  else store.set('hcc-demo-route', path);
  render();
  if (path.split('/').slice(0, 3).join('/') !== prevBase) window.scrollTo(0, 0);
}
window.addEventListener('popstate', () => { if (!DEMO) { S.route = location.hash.slice(1) || '/'; render(); } });

// ======================= Rendering =======================
let afterRender = [];
const onAfter = (fn) => afterRender.push(fn);

function captureInputs(root) {
  const vals = {};
  for (const el of $$('input[id], textarea[id], select[id]', root)) {
    if (el.type === 'file') continue;
    vals[el.id] = el.type === 'checkbox' ? el.checked : el.value;
  }
  const a = document.activeElement;
  return { vals, focus: a?.id && root.contains(a) ? { id: a.id, s: a.selectionStart, e: a.selectionEnd } : null };
}
function restoreInputs(root, k) {
  for (const [id, v] of Object.entries(k.vals)) {
    const el = root.querySelector('#' + CSS.escape(id));
    if (!el || el.dataset.fresh) continue;
    if (el.type === 'checkbox') el.checked = v; else el.value = v;
  }
  if (k.focus) { const el = root.querySelector('#' + CSS.escape(k.focus.id)); if (el) { el.focus(); try { el.setSelectionRange(k.focus.s, k.focus.e); } catch { /* not text */ } } }
}

function render() {
  if (!S.booted) return;
  const root = $('#app');
  const r = matchRoute(S.route);
  const sameRoute = root.dataset.route === S.route;
  const keep = sameRoute ? captureInputs(root) : { vals: {}, focus: null };
  const scrollers = sameRoute ? $$('[data-keep-scroll]', root).map((el) => [el.dataset.keepScroll, el.scrollLeft, el.scrollTop]) : [];
  afterRender = [];
  let body;
  if (r.opts.need && HC.ROLE_RANK[role()] < HC.ROLE_RANK[r.opts.need]) {
    body = S.user ? emptyState('No access', 'Your role cannot open this page. Ask an admin if you need it.') : loginView();
  } else {
    try { body = r.view(r.params); } catch (e) { console.error(e); body = emptyState('Something broke', esc(e.message)); }
  }
  root.innerHTML = r.opts.bare ? body : shell(body, r);
  root.dataset.route = S.route;
  restoreInputs(root, keep);
  for (const [k, x, y] of scrollers) { const el = root.querySelector(`[data-keep-scroll="${k}"]`); if (el) { el.scrollLeft = x; el.scrollTop = y; } }
  for (const f of afterRender) try { f(); } catch (e) { console.error(e); }
}

// ======================= UI primitives =======================
const ICONS = {
  home: 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z',
  book: 'M4 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-5a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h6z',
  users: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M22 19v-1a4 4 0 0 0-3-3.8M16 3.2a3.5 3.5 0 0 1 0 6.6',
  folder: 'M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  box: 'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  hardhat: 'M2 18h20M4 18v-3a8 8 0 0 1 16 0v3M10 7V4h4v3',
  cart: 'M3 4h2l2.4 11h11L21 8H6.2M9 20a1 1 0 1 0 0-.01M18 20a1 1 0 1 0 0-.01',
  bell: 'M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3',
  plus: 'M12 5v14M5 12h14',
  x: 'M18 6 6 18M6 6l12 12',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
  download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  printer: 'M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z',
  camera: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  clip: 'M21.4 11.1 12.2 20.3a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
  check: 'M20 6 9 17l-5-5',
  menu: 'M3 6h18M3 12h18M3 18h18',
  cable: 'M4 4v6a4 4 0 0 0 4 4h8a4 4 0 0 1 4 4v2M2 4h4M18 20h4',
  map: 'M9 3 3 6v15l6-3 6 3 6-3V3l-6 3zM9 3v15M15 6v15',
  dollar: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  image: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3M21 15l-5-5L5 21',
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6',
  chevron: 'M9 18l6-6-6-6',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  pin: 'M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12zM12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  board: 'M3 3h7v18H3zM14 3h7v11h-7z',
  cal: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM16 1v4M8 1v4M3 9h18',
  gantt: 'M3 5h10M7 12h12M5 19h8',
  chat: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
};
const icon = (n, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[n] || ''}"/></svg>`;

function avatar(id, size = '') {
  const name = S.users.find((u) => u.id === id)?.name || id || '?';
  return `<span class="avatar ${size}" title="${esc(name)}" style="--h:${hue(name)}">${esc(initials(name))}</span>`;
}
const pill = (text, kind) => `<span class="pill pill-${esc(kind || slugify(text))}">${esc(text)}</span>`;
function slugify(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function emptyState(title, text, actions = '') {
  return `<div class="empty"><div class="empty-mark">${icon('box')}</div><h3>${esc(title)}</h3><p>${text}</p>${actions}</div>`;
}
function pageHead(title, sub, actions = '', eyebrow = '') {
  return `<header class="page-head"><div class="page-head-text">${eyebrow ? `<div class="eyebrow">${eyebrow}</div>` : ''}<h1>${esc(title)}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div><div class="page-actions">${actions}</div></header>`;
}
function tabs(items, active, act = 'go') {
  return `<nav class="tabs" role="tablist" data-keep-scroll="tabs">${items.map(([key, label, ic, to]) => `<button role="tab" class="tab ${key === active ? 'on' : ''}" data-click="${act}" data-to="${esc(to || key)}" data-key="${esc(key)}">${ic ? icon(ic) : ''}<span>${esc(label)}</span></button>`).join('')}</nav>`;
}

// Toasts
function toast(msg, kind = 'ok', link) {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.innerHTML = `<span>${esc(msg)}</span>${link ? `<button class="btn btn-sm btn-ghost" data-click="go" data-to="${esc(link)}">Open</button>` : ''}`;
  box.appendChild(el);
  setTimeout(() => el.classList.add('out'), kind === 'error' ? 6000 : 3200);
  setTimeout(() => el.remove(), kind === 'error' ? 6500 : 3700);
}

// Modals (stacked layers)
const LAYERS = [];
function openModal({ title, body, wide, foot = '', onClose, cls = '' }) {
  const el = document.createElement('div');
  el.className = 'modal-wrap';
  el.innerHTML = `<div class="modal-backdrop" data-click="closeModal"></div><div class="modal ${wide ? 'wide' : ''} ${cls}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn" data-click="closeModal" aria-label="Close">${icon('x')}</button></header><div class="modal-body">${body}</div>${foot ? `<footer class="modal-foot">${foot}</footer>` : ''}</div>`;
  $('#modals').appendChild(el);
  const layer = { el, onClose };
  LAYERS.push(layer);
  document.body.classList.add('modal-open');
  setTimeout(() => el.querySelector('[autofocus], .modal-body input:not([type=hidden]):not([type=checkbox]), .modal-body textarea')?.focus(), 30);
  return layer;
}
function closeModal() {
  const l = LAYERS.pop();
  if (!l) return;
  l.el.remove(); l.onClose?.();
  if (!LAYERS.length) document.body.classList.remove('modal-open');
}
const topLayer = () => LAYERS[LAYERS.length - 1];
function ask(message, { danger, ok = 'OK' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const l = openModal({ title: 'Please confirm', body: `<p>${esc(message)}</p>`, foot: `<button class="btn btn-ghost" data-click="closeModal">Cancel</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-click="askOk">${esc(ok)}</button>`, onClose: () => { if (!done) resolve(false); } });
    l.ok = () => { done = true; closeModal(); resolve(true); };
  });
}

// ======================= Files =======================
const isImage = (m) => /^image\//.test(m || '');
const isVideo = (m) => /^video\//.test(m || '');
const TEXT_EXT = /\.(txt|cfg|conf|config|ini|json|xml|yaml|yml|log|csv|md|scn|show|rcp|bak|cnf|sh|ps1|toml|properties|html?|js|css)$/i;
const isTextFile = (f) => /^text\/|json|xml|yaml/.test(f.mime || '') || TEXT_EXT.test(f.name || '');
function fileHref(f) { return f.url || api.fileUrl(f.fileId || f.id); }
function linkKind(url) {
  const u = String(url);
  if (/drive\.google|docs\.google/.test(u)) return 'Google Drive';
  if (/dropbox\.com/.test(u)) return 'Dropbox';
  if (/sharepoint\.com|onedrive|1drv\.ms/.test(u)) return 'OneDrive';
  if (/box\.com/.test(u)) return 'Box';
  return 'Link';
}
async function uploadFiles(files, opts = {}) {
  const out = [];
  for (const file of files) {
    const el = document.createElement('div');
    el.className = 'toast toast-info';
    el.innerHTML = `<span>Uploading ${esc(file.name)}… <b>0%</b></span>`;
    $('#toasts').appendChild(el);
    try {
      const r = await api.upload(file, opts, (p) => { el.querySelector('b').textContent = Math.round(p * 100) + '%'; });
      out.push({ fileId: r.id, name: r.name, mime: r.mime, size: r.size, at: new Date().toISOString(), by: S.user?.id });
    } catch (e) { toast(`${file.name}: ${e.message}`, 'error'); }
    el.remove();
  }
  return out;
}
function pickFiles({ accept = '', multiple = true, capture } = {}) {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = accept; inp.multiple = multiple;
    if (capture) inp.setAttribute('capture', 'environment');
    inp.onchange = () => resolve([...inp.files]);
    inp.click();
  });
}
const fmtSize = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : b > 1024 ? Math.round(b / 1024) + ' KB' : (b || 0) + ' B');

function attachmentList(items, { removable, key } = {}) {
  if (!items?.length) return '<p class="muted small">No files yet.</p>';
  return `<ul class="files">${items.map((f, i) => {
    const thumb = f.url ? `<span class="file-ico">${icon('link')}</span>` : isImage(f.mime) ? `<img class="file-thumb" src="${esc(fileHref(f))}" alt="" loading="lazy">` : `<span class="file-ico">${icon(isVideo(f.mime) ? 'camera' : 'file')}</span>`;
    return `<li class="file">${thumb}<button class="file-name" data-click="viewFile" data-json="${esc(JSON.stringify(f))}">${esc(f.name || f.url)}</button><span class="muted small">${f.url ? linkKind(f.url) : fmtSize(f.size)}</span>${removable ? `<button class="icon-btn" data-click="removeAttachment" data-key="${key}" data-i="${i}" aria-label="Remove">${icon('x')}</button>` : ''}</li>`;
  }).join('')}</ul>`;
}

async function viewFile(f) {
  const href = f._src || fileHref(f);
  let body;
  if (f.url) {
    body = `<p>This file is stored in ${linkKind(f.url)}.</p><p><a class="btn btn-primary" href="${esc(safeUrl(f.url))}" target="_blank" rel="noopener">Open in ${linkKind(f.url)}</a></p><p class="mono small selectable">${esc(f.url)}</p>`;
  } else if (!href) {
    body = '<p>This file was uploaded in another browser, so it is not available here.</p>';
  } else if (isImage(f.mime)) body = `<img class="viewer-img" src="${esc(href)}" alt="${esc(f.name)}">`;
  else if (isVideo(f.mime)) body = `<video class="viewer-img" src="${esc(href)}" controls playsinline></video>`;
  else if (/pdf/.test(f.mime)) body = `<iframe class="viewer-pdf" src="${esc(href)}" title="${esc(f.name)}"></iframe>`;
  else if (isTextFile(f)) {
    body = '<p class="muted">Loading…</p>';
    api.fileText(f.fileId).then((t) => {
      const el = $('.modal-wrap:last-child .modal-body');
      if (!el) return;
      const lines = t.split('\n');
      el.innerHTML = `<div class="viewer-tools"><input id="cfg-filter" class="input" placeholder="Filter lines…" data-input="filterConfig"><span class="muted small">${lines.length} lines · ${fmtSize(f.size)}</span></div><div class="config-view" id="cfg-view">${lines.map((l, i) => `<div class="cl"><span class="ln">${i + 1}</span><span class="lt">${esc(l) || ' '}</span></div>`).join('')}</div>`;
    }).catch((e) => { const el = $('.modal-wrap:last-child .modal-body'); if (el) el.innerHTML = `<p>${esc(e.message)}</p>`; });
  } else body = `<p>No preview for this file type.</p>`;
  const dl = !DEMO && !f.url && href ? `<a class="btn" href="${esc(href)}?download=1" download="${esc(f.name)}" target="_blank" rel="noopener">${icon('download')} Download</a>` : '';
  openModal({ title: f.name || 'File', body, wide: true, foot: `${f.size ? `<span class="muted small">${fmtSize(f.size)}${f.at ? ' · ' + ago(f.at) : ''}</span>` : ''}${dl}` });
}

// ======================= Exports =======================
function toCSV(rows, cols) {
  const cell = (v) => { const s = Array.isArray(v) ? v.join('; ') : String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.map((c) => cell(c.label)).join(','), ...rows.map((r) => cols.map((c) => cell(c.csv ? c.csv(r) : r[c.k])).join(','))].join('\n');
}
function downloadText(name, text, mime = 'text/csv') {
  if (DEMO) {
    openModal({ title: `Export: ${name}`, wide: true, body: `<p class="muted">Downloads are blocked in this preview. Copy the CSV below, or deploy the app to download files directly.</p><textarea class="input mono" rows="14" readonly id="export-text">${esc(text)}</textarea>`, foot: '<button class="btn btn-primary" data-click="copyExport">Copy CSV</button>' });
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function printPage() {
  if (DEMO) return toast('PDF export opens the print dialog (Save as PDF). It works in the deployed app; this preview blocks printing.', 'info');
  window.print();
}

// ======================= Tables =======================
const TABLES = {};
/** cols: [{k,label,render?,csv?,cls?,sort?}] */
function dataTable(id, rows, cols, { onRow, csv, empty = 'Nothing here yet.', search = true, toolbar = '' } = {}) {
  TABLES[id] = { rows, cols, csv };
  const st = S.ui['tbl_' + id] || {};
  let shown = rows;
  const qv = (st.q || '').toLowerCase();
  if (qv) shown = shown.filter((r) => cols.some((c) => String(c.csv ? c.csv(r) : r[c.k] ?? '').toLowerCase().includes(qv)));
  if (st.sort) {
    const c = cols.find((x) => x.k === st.sort);
    if (c) {
      const val = (r) => (c.sort ? c.sort(r) : c.csv ? c.csv(r) : r[c.k]);
      shown = [...shown].sort((a, b) => { const x = val(a), y = val(b); return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true })) * (st.dir === 'desc' ? -1 : 1); });
    }
  }
  const head = cols.map((c) => `<th class="${c.cls || ''}"><button class="th-btn" data-click="sortTable" data-table="${id}" data-k="${c.k}">${esc(c.label)}${st.sort === c.k ? (st.dir === 'desc' ? ' ↓' : ' ↑') : ''}</button></th>`).join('');
  const bodyRows = shown.map((r) => `<tr ${onRow ? `class="clickable" data-click="${onRow}" data-id="${esc(r.id)}"` : ''}>${cols.map((c) => `<td class="${c.cls || ''}" data-label="${esc(c.label)}">${c.render ? c.render(r) : esc(r[c.k])}</td>`).join('')}</tr>`).join('');
  return `<div class="table-block" data-tbl="${id}">
    <div class="table-tools">${search ? `<label class="search-inline">${icon('search')}<input id="tq-${id}" class="input" placeholder="Search…" data-input="tableSearch" data-table="${id}" value="${esc(st.q || '')}"></label>` : ''}${toolbar}<span class="spacer"></span>${csv ? `<button class="btn btn-sm btn-ghost" data-click="exportTable" data-table="${id}">${icon('download')} CSV</button><button class="btn btn-sm btn-ghost hide-sm" data-click="print">${icon('printer')} PDF</button>` : ''}</div>
    ${shown.length ? `<div class="table-wrap"><table class="table resp"><thead><tr>${head}</tr></thead><tbody>${bodyRows}</tbody></table></div>` : `<p class="muted pad">${rows.length ? 'No matches.' : empty}</p>`}
  </div>`;
}

// ======================= Forms =======================
/**
 * Field spec: { k, label, type, options, req, full, help, placeholder }
 * types: text textarea markdown number money date datetime select multi users user people roles contractor project labels attachments photos lines checkbox color url email tel
 */
function optionList(f) {
  if (typeof f.options === 'function') return f.options();
  if (Array.isArray(f.options)) return f.options.map((o) => (Array.isArray(o) ? o : [o, o]));
  if (f.type === 'user') return S.users.map((u) => [u.id, u.name]);
  if (f.type === 'contractor') return list('contractors').map((c) => [c.id, c.company]);
  if (f.type === 'project') return list('projects').map((p) => [p.id, p.name]);
  if (f.type === 'person') return list('people').map((p) => [p.id, p.name]);
  return [];
}
function fieldHTML(f, v, fid) {
  const id = `f-${fid}-${f.k}`;
  const req = f.req ? 'required' : '';
  const label = `<label class="label" for="${id}">${esc(f.label)}${f.req ? ' <span class="req">*</span>' : ''}</label>`;
  const help = f.help ? `<p class="help">${f.help}</p>` : '';
  const wrap = (inner, cls = '') => `<div class="field ${f.full ? 'full' : ''} ${cls}">${label}${inner}${help}</div>`;
  switch (f.type) {
    case 'textarea': return wrap(`<textarea id="${id}" name="${f.k}" class="input" rows="${f.rows || 3}" ${req} placeholder="${esc(f.placeholder || '')}">${esc(v)}</textarea>`);
    case 'markdown': return wrap(`<textarea id="${id}" name="${f.k}" class="input mono" rows="${f.rows || 8}" ${req} placeholder="Markdown: ## Heading, - list, **bold**">${esc(v)}</textarea>`);
    case 'number': case 'money': return wrap(`<input id="${id}" name="${f.k}" class="input" type="number" step="${f.type === 'money' ? '0.01' : 'any'}" inputmode="decimal" ${req} value="${esc(v ?? '')}">`);
    case 'date': return wrap(`<input id="${id}" name="${f.k}" class="input" type="date" ${req} value="${esc(v || '')}">`);
    case 'checkbox': return `<div class="field ${f.full ? 'full' : ''}"><label class="check"><input id="${id}" type="checkbox" name="${f.k}" ${v ? 'checked' : ''}> <span>${esc(f.label)}</span></label>${help}</div>`;
    case 'color': return wrap(`<input id="${id}" name="${f.k}" class="input color" type="color" value="${esc(v || '#d4d4d4')}">`);
    case 'select': case 'user': case 'contractor': case 'project': case 'person':
      return wrap(`<select id="${id}" name="${f.k}" class="input" ${req}>${f.req ? '' : '<option value="">—</option>'}${optionList(f).map(([val, lab]) => `<option value="${esc(val)}" ${String(v ?? '') === String(val) ? 'selected' : ''}>${esc(lab)}</option>`).join('')}</select>`);
    case 'users': case 'multi': case 'roles': {
      const opts = f.type === 'users' ? S.users.map((u) => [u.id, u.name]) : f.type === 'roles' ? list('teamRoles').map((r) => [r.id, r.name]) : optionList(f);
      const set = new Set(v || []);
      return wrap(`<div class="chips-select">${opts.map(([val, lab]) => `<label class="chip-toggle"><input type="checkbox" name="${f.k}" value="${esc(val)}" ${set.has(val) ? 'checked' : ''}><span>${esc(lab)}</span></label>`).join('') || '<span class="muted small">No options yet.</span>'}</div>`);
    }
    case 'labels': {
      const all = [...new Set(list(f.source || 'tasks').flatMap((t) => t.labels || []))];
      return wrap(`<input id="${id}" name="${f.k}" class="input" list="${id}-dl" value="${esc((v || []).join(', '))}" placeholder="Comma separated"><datalist id="${id}-dl">${all.map((l) => `<option value="${esc(l)}">`).join('')}</datalist>`);
    }
    case 'attachments': case 'photos':
      return wrap(`<div class="attach" data-widget="${f.k}">${attachmentList(v, { removable: true, key: f.k })}</div><div class="row gap-sm wrap">${f.type === 'photos' ? `<button type="button" class="btn btn-sm" data-click="formAddFiles" data-key="${f.k}" data-capture="1" data-accept="image/*">${icon('camera')} Take photo</button>` : ''}<button type="button" class="btn btn-sm" data-click="formAddFiles" data-key="${f.k}" data-accept="${f.type === 'photos' ? 'image/*,video/*' : f.accept || ''}">${icon('clip')} Upload</button>${f.type === 'attachments' ? `<button type="button" class="btn btn-sm btn-ghost" data-click="formAddLink" data-key="${f.k}">${icon('link')} Add link</button>` : ''}</div>`, 'full');
    case 'lines':
      return `<div class="field full"><label class="label">${esc(f.label)}</label><div class="lines" data-lines="${f.k}"><div class="line line-head"><span>Description</span><span>Qty</span><span>Unit cost</span><span>Received</span><span></span></div>${(v || []).map(lineRow).join('')}</div><button type="button" class="btn btn-sm" data-click="addLine" data-key="${f.k}">${icon('plus')} Add line</button></div>`;
    default:
      return wrap(`<input id="${id}" name="${f.k}" class="input" type="${f.type === 'email' || f.type === 'tel' || f.type === 'url' ? f.type : 'text'}" ${req} value="${esc(v ?? '')}" placeholder="${esc(f.placeholder || '')}">`);
  }
}
function lineRow(l = {}) {
  return `<div class="line"><input class="input" data-l="desc" value="${esc(l.desc || '')}" placeholder="Item" aria-label="Description"><input class="input" data-l="qty" type="number" step="any" value="${esc(l.qty ?? 1)}" aria-label="Quantity"><input class="input" data-l="unitCost" type="number" step="0.01" value="${esc(l.unitCost ?? '')}" aria-label="Unit cost"><input class="input" data-l="receivedQty" type="number" step="any" value="${esc(l.receivedQty ?? 0)}" aria-label="Received"><button type="button" class="icon-btn" data-click="removeLine" aria-label="Remove line">${icon('x')}</button></div>`;
}

function readFields(form, fields, base) {
  const fd = new FormData(form);
  const out = { ...base };
  for (const f of fields) {
    switch (f.type) {
      case 'users': case 'multi': case 'roles': out[f.k] = fd.getAll(f.k); break;
      case 'checkbox': out[f.k] = fd.has(f.k); break;
      case 'number': case 'money': out[f.k] = fd.get(f.k) === '' ? null : num(fd.get(f.k)); break;
      case 'labels': out[f.k] = String(fd.get(f.k) || '').split(',').map((s) => s.trim()).filter(Boolean); break;
      case 'attachments': case 'photos': break; // managed live on base
      case 'lines': out[f.k] = $$(`[data-lines="${f.k}"] .line:not(.line-head)`, form).map((row) => ({ desc: $('[data-l=desc]', row).value, qty: num($('[data-l=qty]', row).value), unitCost: num($('[data-l=unitCost]', row).value), receivedQty: num($('[data-l=receivedQty]', row).value) })).filter((l) => l.desc); break;
      default: out[f.k] = fd.get(f.k) ?? out[f.k];
    }
  }
  return out;
}

let formSeq = 0;
/** Generic create/edit modal for a collection. */
function editForm(coll, doc, { title, fields, onSaved, defaults = {}, deletable = true, transform } = {}) {
  const schema = SCHEMAS[coll] || {};
  fields = fields || schema.fields;
  const isNew = !doc?.id || !byId(coll, doc.id);
  const work = JSON.parse(JSON.stringify({ ...defaults, ...(doc || {}) }));
  const fid = ++formSeq;
  const body = `<form class="form-grid" data-submit="submitForm" id="form-${fid}">${fields.map((f) => fieldHTML(f, work[f.k], fid)).join('')}<button type="submit" hidden></button></form>`;
  const foot = `${!isNew && deletable && isEditor() ? `<button class="btn btn-ghost danger-text" data-click="deleteFromForm">${icon('trash')} Delete</button>` : ''}<span class="spacer"></span><button class="btn btn-ghost" data-click="closeModal">Cancel</button><button class="btn btn-primary" data-click="submitTop">${isNew ? 'Create' : 'Save'}</button>`;
  const layer = openModal({ title: title || `${isNew ? 'New' : 'Edit'} ${schema.noun || 'item'}`, body, foot, wide: fields.length > 6 });
  Object.assign(layer, {
    form: { coll, fields, work, onSaved, transform, isNew },
    async submit() {
      const formEl = $('form', layer.el);
      if (!formEl.reportValidity()) return;
      let out = readFields(formEl, fields, layer.form.work);
      if (transform) out = transform(out);
      const saved = await save(coll, out);
      closeModal();
      onSaved?.(saved);
    },
    async del() {
      const label = HC.docName(work);
      if (await removeDoc(coll, work.id, `“${label}”`)) closeModal();
    },
  });
  return layer;
}

// ======================= Markdown (SOP format) =======================
function safeUrl(u) {
  u = String(u || '').trim();
  if (/^(https?:|mailto:|tel:|\/|#|blob:|data:image\/(png|gif|jpe?g|webp|svg\+xml)[;,])/i.test(u)) return u;
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(u)) return 'https://' + u;
  return '#';
}
function resolveUrl(u) {
  const m = String(u).match(/^\/files\/([a-zA-Z0-9]+)/);
  if (m) return api.fileUrl(m[1]) || u;
  return safeUrl(u);
}
const VIDEO_RE = /\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i;
function ytId(u) { const m = String(u).match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/); return m ? m[1] : /^[\w-]{11}$/.test(u) ? u : null; }

function inline(s) {
  const tokens = [];
  const hold = (html) => `\u0001${tokens.push(html) - 1}\u0001`;
  s = String(s).replace(/`([^`]+)`/g, (_, c) => hold(`<code>${esc(c)}</code>`));
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, url) => hold(`<img src="${esc(resolveUrl(url))}" alt="${esc(alt)}" loading="lazy" class="inline-img" data-click="zoom">`));
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, url) => {
    const u = safeUrl(url);
    const internal = u.startsWith('/') && !u.startsWith('/files/');
    return hold(internal ? `<a href="#${esc(u)}" data-click="go" data-to="${esc(u)}">${esc(text)}</a>` : `<a href="${esc(resolveUrl(url))}" target="_blank" rel="noopener">${esc(text)}</a>`);
  });
  s = s.replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)]/g, (u) => hold(`<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a>`));
  s = esc(s);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^\w*])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/(^|[^\w])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/(^|\s)@([a-zA-Z0-9._-]+)/g, (m0, pre, u) => { const usr = S.users.find((x) => x.username.toLowerCase() === u.toLowerCase()); return usr ? `${pre}<span class="mention">@${esc(usr.name)}</span>` : m0; });
  return s.replace(/\u0001(\d+)\u0001/g, (_, i) => tokens[i]);
}

function mediaBlock(alt, url) {
  const src = esc(resolveUrl(url));
  const cap = alt.replace(/^video:?\s*/i, '');
  const fig = (inner) => `<figure class="media">${inner}${cap ? `<figcaption>${esc(cap)}</figcaption>` : ''}</figure>`;
  if (/^video\b/i.test(alt) || VIDEO_RE.test(url)) return fig(`<video src="${src}" controls playsinline preload="metadata"></video>`);
  return fig(`<img src="${src}" alt="${esc(cap)}" loading="lazy" data-click="zoom">`);
}
function embedBlock(kind, url) {
  const id = ytId(url);
  if (/youtube/i.test(kind) && id) {
    return `<figure class="media embed"><div class="ratio"><iframe src="https://www.youtube-nocookie.com/embed/${esc(id)}" title="YouTube video" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div><figcaption><a href="https://youtu.be/${esc(id)}" target="_blank" rel="noopener">Open on YouTube</a></figcaption></figure>`;
  }
  if (/vimeo/i.test(kind)) { const vid = String(url).match(/(\d{6,})/)?.[1]; if (vid) return `<figure class="media embed"><div class="ratio"><iframe src="https://player.vimeo.com/video/${vid}" title="Vimeo video" allowfullscreen loading="lazy"></iframe></div></figure>`; }
  return mediaBlock('video', url);
}

const CALLOUTS = { note: 'Note', info: 'Info', tip: 'Tip', warning: 'Warning', danger: 'Danger', check: 'Check' };
function md(src, toc) {
  const used = {};
  const slugOf = (t) => { let s = slugify(t.replace(/[`*_]/g, '')) || 'section'; if (used[s]) s += '-' + ++used[s]; else used[s] = 1; return s; };
  const isStart = (l, next) => /^\s*```/.test(l) || /^:::/.test(l) || /^#{1,4}\s/.test(l) || /^\s*([-*+]|\d+[.)])\s+/.test(l) || /^\s*>/.test(l) || /^\s*(---|\*\*\*)\s*$/.test(l) || /^\s*!\[[^\]]*\]\([^)]+\)\s*$/.test(l) || /^\s*@\[\w+\]\(/.test(l) || (l.includes('|') && next && /^\s*\|?\s*:?-{2,}/.test(next));

  function blocks(lines) {
    let out = ''; let i = 0; let m;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      if ((m = line.match(/^\s*```\s*([\w+-]*)/))) {
        const buf = []; i++;
        while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++]);
        i++;
        out += `<div class="code"><div class="code-bar"><span>${esc(m[1] || 'text')}</span><button class="btn btn-xs btn-ghost" data-click="copyCode">Copy</button></div><pre><code>${esc(buf.join('\n'))}</code></pre></div>`;
        continue;
      }
      if ((m = line.match(/^:::\s*(\w+)\s*(.*)$/))) {
        const type = m[1].toLowerCase(), title = m[2].trim();
        let depth = 1; const buf = []; i++;
        while (i < lines.length) {
          const l = lines[i];
          if (/^:::\s*\w+/.test(l)) depth++;
          else if (/^:::\s*$/.test(l) && --depth === 0) { i++; break; }
          buf.push(l); i++;
        }
        if (type === 'steps') {
          const steps = []; let cur = null;
          for (const l of buf) { const h = l.match(/^###\s+(.*)/); if (h) { cur = { title: h[1], lines: [] }; steps.push(cur); } else if (cur) cur.lines.push(l); }
          out += `<ol class="steps">${steps.map((s) => { const sid = slugOf(s.title); if (toc) toc.push({ lvl: 3, text: s.title, id: sid }); return `<li class="step" id="${sid}"><div class="step-title">${inline(s.title)}</div><div class="step-body">${blocks(s.lines)}</div></li>`; }).join('')}</ol>`;
        } else if (type === 'accordion') {
          out += `<details class="accordion"><summary>${inline(title || 'Details')}</summary><div class="accordion-body">${blocks(buf)}</div></details>`;
        } else if (CALLOUTS[type]) {
          out += `<aside class="callout callout-${type}"><div class="callout-ico" aria-hidden="true"></div><div class="callout-body">${title ? `<div class="callout-title">${inline(title)}</div>` : ''}${blocks(buf)}</div></aside>`;
        } else out += `<div class="block-${esc(type)}">${blocks(buf)}</div>`;
        continue;
      }
      if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
        const lvl = m[1].length, id = slugOf(m[2]);
        if (toc && lvl >= 2 && lvl <= 3) toc.push({ lvl, text: m[2], id });
        out += `<h${lvl} id="${id}">${inline(m[2])}<button class="anchor" data-click="scrollTo" data-target="${id}" aria-label="Link to section">#</button></h${lvl}>`;
        i++; continue;
      }
      if (/^\s*(---|\*\*\*)\s*$/.test(line)) { out += '<hr>'; i++; continue; }
      if (line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
        const split = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        const head = split(line); i += 2; const rows = [];
        while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(split(lines[i++]));
        out += `<div class="table-wrap md-table"><table><thead><tr>${head.map((h) => `<th>${inline(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${head.map((_, j) => `<td>${inline(r[j] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
        continue;
      }
      if (/^\s*>/.test(line)) {
        const buf = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*> ?/, ''));
        out += `<blockquote>${blocks(buf)}</blockquote>`; continue;
      }
      if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
        const items = [];
        while (i < lines.length) {
          const l = lines[i]; const lm = l.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
          if (lm) { items.push({ ind: lm[1].length, ord: /\d/.test(lm[2]), text: lm[3] }); i++; }
          else if (l.trim() && /^\s{2,}/.test(l) && items.length) { items[items.length - 1].text += '\n' + l.trim(); i++; }
          else break;
        }
        out += buildList(items); continue;
      }
      if ((m = line.trim().match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/))) { out += mediaBlock(m[1], m[2]); i++; continue; }
      if ((m = line.trim().match(/^@\[(\w+)\]\(([^)]+)\)$/))) { out += embedBlock(m[1], m[2]); i++; continue; }
      const buf = [lines[i++]];
      while (i < lines.length && lines[i].trim() && !isStart(lines[i], lines[i + 1])) buf.push(lines[i++]);
      out += `<p>${buf.map(inline).join('<br>')}</p>`;
    }
    return out;
  }
  function buildList(items) {
    if (!items.length) return '';
    const base = items[0].ind; const tag = items[0].ord ? 'ol' : 'ul';
    let html = ''; let k = 0;
    while (k < items.length) {
      const it = items[k]; k++;
      const kids = [];
      while (k < items.length && items[k].ind > base) kids.push(items[k++]);
      const tm = it.text.match(/^\[( |x|X)\]\s+(.*)$/s);
      const txt = (tm ? tm[2] : it.text).split('\n').map(inline).join('<br>');
      html += tm ? `<li class="task ${tm[1] !== ' ' ? 'done' : ''}"><span class="box" aria-hidden="true"></span><span>${txt}</span>${buildList(kids)}</li>` : `<li>${txt}${buildList(kids)}</li>`;
    }
    const hasTasks = items.some((x) => x.ind === base && /^\[( |x|X)\]\s/.test(x.text));
    return `<${tag} class="${hasTasks ? 'tasklist' : ''}">${html}</${tag}>`;
  }
  return blocks(String(src || '').replace(/\r\n?/g, '\n').split('\n'));
}
