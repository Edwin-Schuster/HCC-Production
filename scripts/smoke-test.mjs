// Starts the server against a throwaway data folder and checks auth, permissions, CRUD, files and the calendar feed.
// Usage: npm test
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hcc-test-'));
const port = 18000 + Math.floor(Math.random() * 1000);
const base = `http://127.0.0.1:${port}`;
const srv = spawn(process.execPath, ['--no-warnings', 'server/server.js'], {
  cwd: root, env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, ADMIN_USER: 'admin', ADMIN_PASSWORD: 'admin-pass-123', SEED_DEMO: 'true' }, stdio: 'ignore',
});

async function call(method, url, body, cookie, headers = {}) {
  const r = await fetch(base + url, { method, headers: { ...(body && !(body instanceof Uint8Array) ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: body instanceof Uint8Array ? body : body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, json, headers: r.headers };
}
const login = async (u, p) => { const r = await call('POST', '/api/login', { username: u, password: p }); assert.equal(r.status, 200, `login ${u}`); return r.headers.get('set-cookie').split(';')[0]; };

let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log(`  ✓ ${name}`); };

try {
  for (let i = 0; i < 50; i++) { try { if ((await fetch(base + '/api/health')).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 100)); }

  await check('public visitors see public SOPs only', async () => {
    const r = await call('GET', '/api/bootstrap');
    assert.equal(r.json.user, null);
    assert.ok(r.json.data.sops.length > 0 && r.json.data.sops.every((s) => s.public));
    assert.equal(r.json.data.projects, undefined);
  });
  await check('wrong password is rejected', async () => assert.equal((await call('POST', '/api/login', { username: 'admin', password: 'nope' })).status, 401));

  const admin = await login('admin', 'admin-pass-123');
  await check('admin can create a viewer', async () => {
    const r = await call('PUT', '/api/users/', { username: 'viewer1', name: 'Viewer', role: 'viewer', password: 'viewer-pass-1' }, admin);
    assert.equal(r.status, 200);
  });
  const viewer = await login('viewer1', 'viewer-pass-1');
  await check('viewers get redacted projects and no budgets/tasks', async () => {
    const r = await call('GET', '/api/bootstrap', null, viewer);
    assert.ok(r.json.data.projects.length);
    assert.equal(r.json.data.projects[0].budget, undefined);
    assert.equal(r.json.data.tasks, undefined);
    assert.equal(r.json.data.bom, undefined);
    assert.equal((await call('GET', '/api/c/purchases', null, viewer)).status, 403);
  });
  await check('viewers cannot write', async () => assert.equal((await call('PUT', '/api/c/sops/x', { title: 'x' }, viewer)).status, 403));

  await check('assigning a task notifies the assignee', async () => {
    const users = (await call('GET', '/api/users', null, admin)).json;
    const v = users.find((u) => u.username === 'viewer1');
    const r = await call('PUT', '/api/c/tasks/tsk_t1', { projectId: 'proj_sanctuary', title: 'Test', status: 'To Do', priority: 'High', assignees: [v.id] }, admin);
    assert.equal(r.status, 201);
    await new Promise((res) => setTimeout(res, 200));
    const n = (await call('GET', '/api/c/notifications', null, viewer)).json;
    assert.ok(n.some((x) => /assigned you/.test(x.body)));
  });
  await check('comment mentions notify and log activity', async () => {
    await call('PUT', '/api/c/comments/c1', { target: 'tasks:tsk_t1', body: 'hi @maria', authorId: 'usr_admin', authorName: 'Admin' }, admin);
    await new Promise((res) => setTimeout(res, 200));
    const acts = (await call('GET', '/api/c/activity', null, admin)).json;
    assert.ok(acts.some((a) => a.target === 'tasks:tsk_t1' && a.text === 'commented'));
  });
  await check('API keys work as bearer tokens', async () => {
    const k = (await call('POST', '/api/apikeys', { name: 't', role: 'editor' }, admin)).json;
    const r = await call('GET', '/api/c/gear', null, null, { Authorization: `Bearer ${k.token}` });
    assert.equal(r.status, 200); assert.ok(r.json.length);
  });
  await check('file upload and range download', async () => {
    const up = await call('POST', '/api/files?name=config.txt', new TextEncoder().encode('line1\nline2\n'), admin, { 'Content-Type': 'text/plain' });
    assert.equal(up.status, 201);
    const r = await fetch(`${base}/files/${up.json.id}`, { headers: { Cookie: admin, Range: 'bytes=0-4' } });
    assert.equal(r.status, 206); assert.equal(await r.text(), 'line1');
    assert.equal((await fetch(`${base}/files/${up.json.id}`)).status, 401);
  });
  await check('calendar feed needs the token', async () => {
    const s = (await call('GET', '/api/c/settings', null, admin)).json[0];
    assert.equal((await fetch(`${base}/calendar.ics?token=bad`)).status, 403);
    const ics = await (await fetch(`${base}/calendar.ics?token=${s.calendarToken}`)).text();
    assert.match(ics, /BEGIN:VCALENDAR/); assert.match(ics, /BEGIN:VEVENT/);
  });
  console.log(`\n${passed} checks passed`);
} catch (e) {
  console.error('\nFAILED:', e.message);
  process.exitCode = 1;
} finally {
  srv.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
