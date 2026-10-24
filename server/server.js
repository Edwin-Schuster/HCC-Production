// HCC Production server — zero npm dependencies (Node 22+, built-in SQLite).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import '../public/shared.js';

const HCC = globalThis.HCC;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '../public');
const PORT = Number(process.env.PORT || 8080);
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, '../data'));
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const MAX_UPLOAD = Number(process.env.MAX_UPLOAD_MB || 500) * 1024 * 1024;
const SEED_DEMO = (process.env.SEED_DEMO ?? 'true') !== 'false';
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';
const SESSION_DAYS = 30;

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'hcc.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS docs (coll TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (coll, id));
  CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT, email TEXT, role TEXT NOT NULL, password_hash TEXT, ntfy_topic TEXT, person_id TEXT, created_at TEXT);
  CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, name TEXT, mime TEXT, size INTEGER, public INTEGER DEFAULT 0, created_by TEXT, created_at TEXT);
  CREATE TABLE IF NOT EXISTS apikeys (id TEXT PRIMARY KEY, name TEXT, prefix TEXT, key_hash TEXT UNIQUE, role TEXT, created_at TEXT, last_used TEXT);
`);

// ---------- helpers ----------
const now = () => new Date().toISOString();
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt:${salt}:${crypto.scryptSync(pw, salt, 64).toString('hex')}`;
}
function checkPassword(pw, stored) {
  if (!stored) return false;
  const [, salt, hash] = stored.split(':');
  const a = Buffer.from(hash, 'hex');
  const b = crypto.scryptSync(pw, salt, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const q = {
  getDoc: db.prepare('SELECT data FROM docs WHERE coll = ? AND id = ?'),
  listDocs: db.prepare('SELECT data FROM docs WHERE coll = ? ORDER BY updated_at'),
  putDoc: db.prepare('INSERT INTO docs (coll, id, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(coll, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'),
  delDoc: db.prepare('DELETE FROM docs WHERE coll = ? AND id = ?'),
  userById: db.prepare('SELECT * FROM users WHERE id = ?'),
  userByName: db.prepare('SELECT * FROM users WHERE lower(username) = lower(?)'),
  users: db.prepare('SELECT * FROM users ORDER BY name'),
};

const getDoc = (coll, id) => { const r = q.getDoc.get(coll, id); return r ? JSON.parse(r.data) : null; };
const listDocs = (coll) => q.listDocs.all(coll).map((r) => JSON.parse(r.data));
function putDoc(coll, doc) { const t = now(); doc.updatedAt = doc.updatedAt || t; q.putDoc.run(coll, doc.id, JSON.stringify(doc), t); return doc; }

function publicUser(u, full) {
  if (!u) return null;
  const o = { id: u.id, username: u.username, name: u.name, role: u.role, personId: u.person_id, hasPassword: !!u.password_hash };
  if (full) Object.assign(o, { email: u.email, ntfyTopic: u.ntfy_topic });
  return o;
}
const settings = () => getDoc('settings', 'global') || {};

// ---------- first-run setup ----------
if (!db.prepare('SELECT count(*) AS n FROM users').get().n) {
  const adminId = 'usr_admin';
  const username = process.env.ADMIN_USER || 'admin';
  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
  db.prepare('INSERT INTO users (id, username, name, email, role, password_hash, person_id, created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(adminId, username, process.env.ADMIN_NAME || 'Administrator', process.env.ADMIN_EMAIL || '', 'admin', hashPassword(password), SEED_DEMO ? 'per_edwin' : null, now());
  console.log('\n==============================================');
  console.log(` First run: created admin user "${username}"`);
  if (!process.env.ADMIN_PASSWORD) console.log(` Generated password: ${password}`);
  console.log(' Change it under Profile after signing in.');
  console.log('==============================================\n');

  const data = HCC.seed(adminId);
  if (SEED_DEMO) {
    // Demo teammates exist for assignments but cannot sign in until an admin sets a password.
    const ins = db.prepare('INSERT INTO users (id, username, name, email, role, person_id, created_at) VALUES (?,?,?,?,?,?,?)');
    ins.run('usr_maria', 'maria', 'Maria Lopez', 'maria@example.org', 'editor', 'per_maria', now());
    ins.run('usr_james', 'james', 'James Carter', 'james@example.org', 'editor', 'per_james', now());
    for (const [coll, docs] of Object.entries(data)) for (const d of docs) putDoc(coll, { createdAt: now(), ...d });
  } else {
    putDoc('settings', data.settings[0]);
  }
}

// ---------- realtime (SSE) ----------
const streams = new Set();
function broadcast(coll, id, op, doc) {
  for (const s of streams) {
    if (coll === 'notifications') { if (doc?.userId === s.user.id) s.res.write(`data: ${JSON.stringify({ coll, id, op })}\n\n`); continue; }
    if (HCC.can(s.user.role, coll, 'read')) s.res.write(`data: ${JSON.stringify({ coll, id, op })}\n\n`);
  }
}
setInterval(() => { for (const s of streams) s.res.write(': ping\n\n'); }, 25000);

// ---------- outbound integrations ----------
async function post(url, body, headers = {}) {
  try {
    const r = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(8000) });
    if (!r.ok) console.warn(`POST ${url} -> ${r.status}`);
    return r.ok;
  } catch (e) { console.warn(`POST ${url} failed: ${e.message}`); return false; }
}
const absLink = (link) => { const base = settings().appUrl || process.env.APP_URL || ''; return base ? `${base.replace(/\/$/, '')}/#${link}` : ''; };

async function pushNtfy(topic, { title, body, link }) {
  const s = settings();
  const server = (s.ntfyServer || 'https://ntfy.sh').replace(/\/$/, '');
  const headers = { Title: title.replace(/[^\x20-\x7e]/g, ''), Tags: 'church' };
  const url = absLink(link); if (url) headers.Click = url;
  if (s.ntfyToken) headers.Authorization = `Bearer ${s.ntfyToken}`;
  return post(`${server}/${encodeURIComponent(topic)}`, body, headers);
}

async function fireWebhooks(event, payload) {
  for (const h of listDocs('webhooks')) {
    if (!h.active || !h.url) continue;
    const events = (h.events || '*').split(',').map((x) => x.trim()).filter(Boolean);
    const [c] = event.split('.');
    if (!events.some((e) => e === '*' || e === event || e === `${c}.*`)) continue;
    const body = JSON.stringify({ event, at: now(), ...payload });
    const headers = { 'Content-Type': 'application/json', 'X-HCC-Event': event };
    if (h.secret) headers['X-HCC-Signature'] = 'sha256=' + crypto.createHmac('sha256', h.secret).update(body).digest('hex');
    post(h.url, body, headers);
  }
}

const engine = {
  now,
  get: async (coll, id) => getDoc(coll, id),
  users: async () => q.users.all().map((u) => publicUser(u)),
  put: async (coll, doc) => { putDoc(coll, doc); broadcast(coll, doc.id, 'put', doc); return doc; },
  async notify(userId, n) {
    const doc = { id: HCC.uid('ntf'), userId, ...n, read: false, at: now() };
    putDoc('notifications', doc); broadcast('notifications', doc.id, 'put', doc);
    const u = q.userById.get(userId);
    if (u?.ntfy_topic) pushNtfy(u.ntfy_topic, n);
    fireWebhooks('notification.created', { data: { ...doc, username: u?.username } });
  },
  async channel(n) {
    const s = settings();
    const enabled = s.channelEvents ? s.channelEvents.split(',').map((x) => x.trim()) : null;
    if (enabled && !enabled.includes(n.event)) return;
    const url = absLink(n.link);
    if (s.slackWebhook) post(s.slackWebhook, JSON.stringify({ text: `*${n.title}*\n${n.body}${url ? `\n<${url}|Open in HCC Production>` : ''}` }), { 'Content-Type': 'application/json' });
    if (s.teamsWebhook) post(s.teamsWebhook, JSON.stringify({ text: `**${n.title}**  \n${n.body}${url ? `  \n[Open](${url})` : ''}` }), { 'Content-Type': 'application/json' });
    if (s.channelNtfyTopic) pushNtfy(s.channelNtfyTopic, n);
  },
};

// Due-date reminders every 15 minutes
async function runReminders() {
  try { await HCC.dueReminders(engine, listDocs('tasks'), Number(settings().reminderHours || 24)); } catch (e) { console.error('reminders', e); }
}
setInterval(runReminders, 15 * 60 * 1000);
setTimeout(runReminders, 5000);
setInterval(() => db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now()), 6 * 3600 * 1000);

// ---------- http plumbing ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };

function send(res, status, body, headers = {}) {
  const isObj = body !== null && typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(status, { 'Content-Type': isObj ? 'application/json' : 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(isObj ? JSON.stringify(body) : body);
}
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

function readJSON(req, limit = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new HttpError(413, 'Body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}); } catch { reject(new HttpError(400, 'Invalid JSON')); } });
    req.on('error', reject);
  });
}
function cookies(req) {
  const out = {};
  for (const p of (req.headers.cookie || '').split(';')) { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); }
  return out;
}

function authenticate(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) {
    const key = db.prepare('SELECT * FROM apikeys WHERE key_hash = ?').get(sha256(auth.slice(7).trim()));
    if (!key) return null;
    db.prepare('UPDATE apikeys SET last_used = ? WHERE id = ?').run(now(), key.id);
    return { id: 'api_' + key.id, username: 'api', name: `API: ${key.name}`, role: key.role || 'editor', api: true };
  }
  const token = cookies(req).hcc_session;
  if (!token) return null;
  const s = db.prepare('SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?').get(sha256(token), now());
  if (!s) return null;
  const u = q.userById.get(s.user_id);
  return u ? { ...publicUser(u, true) } : null;
}
const roleOf = (user) => user?.role || 'public';
function need(user, role) {
  if (HCC.ROLE_RANK[roleOf(user)] < HCC.ROLE_RANK[role]) throw new HttpError(user ? 403 : 401, user ? 'You do not have permission for this.' : 'Sign in required.');
}

function readable(user, coll) {
  const role = roleOf(user);
  if (coll === 'settings') return [HCC.redact(role, 'settings', settings())];
  if (coll === 'notifications') return user ? listDocs('notifications').filter((n) => n.userId === user.id).slice(-150) : [];
  if (!HCC.can(role, coll, 'read')) return null;
  let docs = listDocs(coll).map((d) => HCC.redact(role, coll, d)).filter(Boolean);
  if (coll === 'sops' && role === 'public' && !settings().publicSops) docs = [];
  if (coll === 'activity') docs = docs.slice(-800);
  return docs;
}

const loginFails = new Map();

async function api(req, res, url, user) {
  const parts = url.pathname.split('/').filter(Boolean).slice(1); // drop "api"
  const m = req.method;

  if (parts[0] === 'health') return send(res, 200, { ok: true, app: 'hcc-production' });

  if (parts[0] === 'login' && m === 'POST') {
    const ip = req.socket.remoteAddress;
    const f = loginFails.get(ip) || { n: 0, t: 0 };
    if (f.n >= 8 && Date.now() - f.t < 10 * 60 * 1000) throw new HttpError(429, 'Too many attempts. Try again in 10 minutes.');
    const { username, password } = await readJSON(req);
    const u = q.userByName.get(String(username || ''));
    if (!u || !checkPassword(String(password || ''), u.password_hash)) {
      loginFails.set(ip, { n: f.n + 1, t: Date.now() });
      throw new HttpError(401, 'Wrong username or password.');
    }
    loginFails.delete(ip);
    const token = crypto.randomBytes(32).toString('base64url');
    db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)').run(sha256(token), u.id, new Date(Date.now() + SESSION_DAYS * 864e5).toISOString());
    return send(res, 200, { user: publicUser(u, true) }, { 'Set-Cookie': `hcc_session=${token}; HttpOnly; Path=/; Max-Age=${SESSION_DAYS * 86400}; SameSite=Lax${COOKIE_SECURE ? '; Secure' : ''}` });
  }
  if (parts[0] === 'logout' && m === 'POST') {
    const token = cookies(req).hcc_session;
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
    return send(res, 200, { ok: true }, { 'Set-Cookie': 'hcc_session=; Path=/; Max-Age=0' });
  }

  if (parts[0] === 'bootstrap' && m === 'GET') {
    const data = {};
    for (const coll of Object.keys(HCC.ACCESS)) { const d = readable(user, coll); if (d) data[coll] = d; }
    const users = user && !user.api ? q.users.all().map((u) => publicUser(u, roleOf(user) === 'admin')) : [];
    return send(res, 200, { user, users, data });
  }

  if (parts[0] === 'events' && m === 'GET') {
    need(user, 'viewer');
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write(': connected\n\n');
    const s = { user, res }; streams.add(s);
    req.on('close', () => streams.delete(s));
    return;
  }

  // Generic collections: /api/c/:coll[/:id]
  if (parts[0] === 'c') {
    const [, coll, id] = parts;
    if (!HCC.ACCESS[coll]) throw new HttpError(404, 'Unknown collection');
    if (m === 'GET') {
      const docs = readable(user, coll);
      if (!docs) need(user, HCC.ACCESS[coll].read);
      if (!id) return send(res, 200, docs);
      const d = docs.find((x) => x.id === id);
      return d ? send(res, 200, d) : send(res, 404, { error: 'Not found' });
    }
    if (m === 'PUT' || m === 'POST') {
      const body = await readJSON(req);
      const docId = id || body.id || HCC.uid(coll.slice(0, 3));
      const before = getDoc(coll, docId);
      if (coll === 'notifications') {
        need(user, 'viewer');
        if (!before || before.userId !== user.id) throw new HttpError(403, 'Not your notification');
        const doc = { ...before, read: !!body.read };
        putDoc(coll, doc); broadcast(coll, doc.id, 'put', doc);
        return send(res, 200, doc);
      }
      need(user, HCC.ACCESS[coll].write);
      let doc = { ...body, id: docId, createdAt: before?.createdAt || body.createdAt || now(), createdBy: before?.createdBy || user.id, updatedAt: now(), updatedBy: user.id };
      if (coll === 'settings') doc = { ...before, ...body, id: 'global', updatedAt: now() };
      putDoc(coll, doc); broadcast(coll, doc.id, 'put', doc);
      HCC.afterWrite(engine, coll, before, doc, user).catch((e) => console.error('afterWrite', e));
      fireWebhooks(`${coll}.${before ? 'updated' : 'created'}`, { data: doc, actor: { id: user.id, name: user.name } });
      return send(res, before ? 200 : 201, doc);
    }
    if (m === 'DELETE' && id) {
      need(user, HCC.ACCESS[coll].write === 'own' ? 'viewer' : HCC.ACCESS[coll].write);
      const before = getDoc(coll, id);
      if (coll === 'notifications' && before?.userId !== user.id) throw new HttpError(403, 'Not your notification');
      q.delDoc.run(coll, id); broadcast(coll, id, 'delete', before);
      if (before) fireWebhooks(`${coll}.deleted`, { data: before, actor: { id: user.id, name: user.name } });
      return send(res, 200, { ok: true });
    }
  }

  if (parts[0] === 'notifications' && parts[1] === 'read-all' && m === 'POST') {
    need(user, 'viewer');
    for (const n of listDocs('notifications')) if (n.userId === user.id && !n.read) { n.read = true; putDoc('notifications', n); }
    broadcast('notifications', '*', 'put', { userId: user.id });
    return send(res, 200, { ok: true });
  }

  // Roster check-in for the signed-in person (any team member, including viewers)
  if (parts[0] === 'checkin' && m === 'POST') {
    need(user, 'viewer');
    const { status, note, personId } = await readJSON(req);
    const pid = HCC.ROLE_RANK[user.role] >= 2 && personId ? personId : user.personId;
    const person = pid && getDoc('people', pid);
    if (!person) throw new HttpError(400, 'Your account is not linked to a roster entry. Ask an admin to link it.');
    const doc = { ...person, status, statusNote: note || '', lastCheckIn: now(), updatedAt: now() };
    putDoc('people', doc); broadcast('people', doc.id, 'put', doc);
    fireWebhooks('people.checkin', { data: doc, actor: { id: user.id, name: user.name } });
    return send(res, 200, doc);
  }

  // Own profile
  if (parts[0] === 'me' && m === 'PUT') {
    need(user, 'viewer');
    if (user.api) throw new HttpError(400, 'API keys have no profile');
    const b = await readJSON(req);
    const u = q.userById.get(user.id);
    if (b.newPassword) {
      if (!checkPassword(String(b.currentPassword || ''), u.password_hash)) throw new HttpError(400, 'Current password is wrong.');
      if (String(b.newPassword).length < 8) throw new HttpError(400, 'Use at least 8 characters.');
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(b.newPassword), u.id);
    }
    db.prepare('UPDATE users SET name = ?, email = ?, ntfy_topic = ? WHERE id = ?').run(b.name ?? u.name, b.email ?? u.email, b.ntfyTopic ?? u.ntfy_topic, u.id);
    return send(res, 200, { user: publicUser(q.userById.get(u.id), true) });
  }
  if (parts[0] === 'test-notify' && m === 'POST') {
    need(user, 'viewer');
    await engine.notify(user.id, { title: 'Test notification', body: 'Push notifications are working.', link: '/notifications' });
    return send(res, 200, { ok: true });
  }

  // User management (admin)
  if (parts[0] === 'users') {
    need(user, 'admin');
    const id = parts[1];
    if (m === 'GET') return send(res, 200, q.users.all().map((u) => publicUser(u, true)));
    if ((m === 'PUT' || m === 'POST')) {
      const b = await readJSON(req);
      const uidv = id || HCC.uid('usr');
      const existing = q.userById.get(uidv);
      if (!b.username) throw new HttpError(400, 'Username is required.');
      if (!['viewer', 'editor', 'admin'].includes(b.role)) throw new HttpError(400, 'Role must be viewer, editor or admin.');
      const clash = q.userByName.get(b.username);
      if (clash && clash.id !== uidv) throw new HttpError(400, 'That username is taken.');
      if (existing) {
        if (existing.role === 'admin' && b.role !== 'admin' && db.prepare("SELECT count(*) n FROM users WHERE role='admin'").get().n < 2) throw new HttpError(400, 'Keep at least one admin.');
        db.prepare('UPDATE users SET username=?, name=?, email=?, role=?, ntfy_topic=?, person_id=? WHERE id=?').run(b.username, b.name || '', b.email || '', b.role, b.ntfyTopic || '', b.personId || null, uidv);
      } else {
        db.prepare('INSERT INTO users (id, username, name, email, role, ntfy_topic, person_id, created_at) VALUES (?,?,?,?,?,?,?,?)').run(uidv, b.username, b.name || '', b.email || '', b.role, b.ntfyTopic || '', b.personId || null, now());
      }
      if (b.password) {
        if (String(b.password).length < 8) throw new HttpError(400, 'Use at least 8 characters for the password.');
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(b.password), uidv);
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(uidv);
      }
      return send(res, 200, publicUser(q.userById.get(uidv), true));
    }
    if (m === 'DELETE' && id) {
      if (id === user.id) throw new HttpError(400, 'You cannot delete yourself.');
      db.prepare('DELETE FROM users WHERE id = ?').run(id);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
      return send(res, 200, { ok: true });
    }
  }

  // API keys (admin)
  if (parts[0] === 'apikeys') {
    need(user, 'admin');
    if (m === 'GET') return send(res, 200, db.prepare('SELECT id, name, prefix, role, created_at, last_used FROM apikeys').all());
    if (m === 'POST') {
      const b = await readJSON(req);
      const token = 'hcc_' + crypto.randomBytes(24).toString('base64url');
      const id = HCC.uid('key');
      db.prepare('INSERT INTO apikeys (id, name, prefix, key_hash, role, created_at) VALUES (?,?,?,?,?,?)').run(id, b.name || 'API key', token.slice(0, 10), sha256(token), ['viewer', 'editor'].includes(b.role) ? b.role : 'editor', now());
      return send(res, 201, { id, token });
    }
    if (m === 'DELETE' && parts[1]) { db.prepare('DELETE FROM apikeys WHERE id = ?').run(parts[1]); return send(res, 200, { ok: true }); }
  }

  if (parts[0] === 'webhooks' && parts[1] === 'test' && m === 'POST') {
    need(user, 'admin');
    await fireWebhooks('test.ping', { data: { message: 'Hello from HCC Production' } });
    await engine.channel({ title: 'Test message', body: 'Slack / Teams notifications are working.', link: '/', event: 'test' });
    return send(res, 200, { ok: true });
  }

  // File upload: raw body, ?name=&public=1
  if (parts[0] === 'files' && m === 'POST') {
    need(user, 'editor');
    const name = String(url.searchParams.get('name') || 'file').replace(/[\r\n"]/g, '').slice(0, 200);
    const mime = String(req.headers['content-type'] || 'application/octet-stream').split(';')[0];
    const id = crypto.randomBytes(16).toString('hex');
    const dest = path.join(UPLOAD_DIR, id);
    let size = 0;
    await new Promise((resolve, reject) => {
      const out = fs.createWriteStream(dest);
      req.on('data', (c) => { size += c.length; if (size > MAX_UPLOAD) { req.destroy(); out.destroy(); fs.rm(dest, () => {}); reject(new HttpError(413, `File is larger than ${MAX_UPLOAD / 1048576} MB.`)); } });
      req.pipe(out); out.on('finish', resolve); out.on('error', reject); req.on('error', reject);
    });
    db.prepare('INSERT INTO files (id, name, mime, size, public, created_by, created_at) VALUES (?,?,?,?,?,?,?)').run(id, name, mime, size, url.searchParams.get('public') === '1' ? 1 : 0, user.id, now());
    return send(res, 201, { id, name, mime, size });
  }

  throw new HttpError(404, 'Not found');
}

function serveFile(req, res, id, user) {
  const f = /^[a-f0-9]{32}$/.test(id) && db.prepare('SELECT * FROM files WHERE id = ?').get(id);
  if (!f) return send(res, 404, 'Not found');
  if (!f.public) need(user, 'viewer');
  const p = path.join(UPLOAD_DIR, id);
  const stat = fs.statSync(p);
  const range = req.headers.range;
  const headers = { 'Content-Type': f.mime, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=86400', 'Content-Disposition': `${new URL(req.url, 'http://x').searchParams.get('download') ? 'attachment' : 'inline'}; filename="${encodeURIComponent(f.name)}"`, 'X-Content-Type-Options': 'nosniff' };
  // Uploaded HTML/SVG could run script on our origin; force a sandbox.
  if (/html|svg|xml|javascript/.test(f.mime)) headers['Content-Security-Policy'] = 'sandbox';
  if (range) {
    const [s, e] = range.replace('bytes=', '').split('-');
    const start = Number(s) || 0; const end = e ? Number(e) : stat.size - 1;
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1 });
    return fs.createReadStream(p, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...headers, 'Content-Length': stat.size });
  fs.createReadStream(p).pipe(res);
}

function serveStatic(req, res, pathname) {
  let p = path.normalize(path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname));
  if (!p.startsWith(PUBLIC_DIR) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(PUBLIC_DIR, 'index.html');
  const ext = path.extname(p);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300' });
  fs.createReadStream(p).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let user = null;
  try {
    user = authenticate(req);
    if (url.pathname.startsWith('/api/')) return await api(req, res, url, user);
    if (url.pathname.startsWith('/files/')) return serveFile(req, res, url.pathname.split('/')[2], user);
    if (url.pathname === '/calendar.ics') {
      const s = settings();
      if (!s.calendarToken || url.searchParams.get('token') !== s.calendarToken) return send(res, 403, 'Bad calendar token');
      const projects = url.searchParams.get('project');
      const tasks = listDocs('tasks').filter((t) => !projects || t.projectId === projects);
      return send(res, 200, HCC.buildICS({ tasks, projects: listDocs('projects'), access: listDocs('access'), orgName: s.orgName, appUrl: s.appUrl || process.env.APP_URL }), { 'Content-Type': 'text/calendar; charset=utf-8' });
    }
    return serveStatic(req, res, url.pathname);
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message });
    console.error(e);
    if (!res.headersSent) send(res, 500, { error: 'Server error' });
  }
});

server.listen(PORT, () => console.log(`HCC Production listening on :${PORT} (data: ${DATA_DIR})`));
