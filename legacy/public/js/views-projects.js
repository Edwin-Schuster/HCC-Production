'use strict';
/* Projects: overview, tasks (list / board / calendar / timeline), task drawer, cabling, room layouts, budget, contractors, photos, activity, report. */

const PRIORITY_ORDER = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
const isOverdue = (t) => t.due && t.status !== 'Done' && t.due < localDate();
const subtasksOf = (id) => list('tasks').filter((t) => t.parentId === id);
const projectTasks = (pid) => list('tasks').filter((t) => t.projectId === pid);

function projectProgress(pid) {
  const ts = projectTasks(pid);
  const done = ts.filter((t) => t.status === 'Done').length;
  return { total: ts.length, done, pct: ts.length ? Math.round((done / ts.length) * 100) : 0, overdue: ts.filter(isOverdue).length };
}

function budgetCalc(pid) {
  const p = byId('projects', pid) || {};
  const lineTotal = (po) => (po.lines || []).reduce((s, l) => s + num(l.qty) * num(l.unitCost), 0);
  const lineRecv = (po) => (po.lines || []).reduce((s, l) => s + num(l.receivedQty) * num(l.unitCost), 0);
  const bom = list('bom').filter((b) => b.projectId === pid);
  const pos = list('purchases').filter((x) => x.projectId === pid && !['Cancelled', 'Draft'].includes(x.status));
  const inv = list('invoices').filter((x) => x.projectId === pid);
  const sows = list('sow').filter((x) => x.projectId === pid && ['Signed', 'In Progress', 'Complete'].includes(x.status));
  const planned = bom.reduce((s, b) => s + num(b.qty) * num(b.unitCost), 0);
  const committed = pos.reduce((s, x) => s + lineTotal(x), 0) + sows.reduce((s, x) => s + num(x.value), 0);
  const spent = pos.reduce((s, x) => s + lineRecv(x), 0) + inv.filter((i) => i.status === 'Paid').reduce((s, i) => s + num(i.amount), 0);
  const cats = {};
  const c = (k) => (cats[k || 'Other'] ||= { planned: 0, committed: 0, spent: 0 });
  for (const b of bom) c(b.category).planned += num(b.qty) * num(b.unitCost);
  for (const x of pos) { c(x.category).committed += lineTotal(x); c(x.category).spent += lineRecv(x); }
  for (const x of sows) c('Labor').committed += num(x.value);
  for (const i of inv) if (i.status === 'Paid') c('Labor').spent += num(i.amount);
  return { budget: num(p.budget), planned, committed, spent, remaining: num(p.budget) - committed, cats, lineTotal, lineRecv };
}

// ---------------- Projects list ----------------
function viewProjects() {
  const ps = [...list('projects')].sort((a, b) => (a.status === 'Complete') - (b.status === 'Complete') || String(a.start).localeCompare(String(b.start)));
  const cards = ps.map((p) => {
    const prog = isEditor() ? projectProgress(p.id) : null;
    const bud = isEditor() && p.budget ? budgetCalc(p.id) : null;
    return `<button class="proj-card" data-click="go" data-to="/projects/${p.id}" style="--pc:${esc(p.color || '#d4d4d4')}">
      <span class="proj-card-top"><span class="proj-dot"></span>${pill(p.status || 'Planning')}</span>
      <span class="proj-card-name">${esc(p.name)}</span>
      <span class="proj-card-sum">${esc(p.summary || '')}</span>
      <span class="proj-card-dates mono small">${fmtDate(p.start)} → ${fmtDate(p.end)}</span>
      ${prog ? `<span class="meter" title="${prog.pct}% of tasks done"><span style="width:${prog.pct}%"></span></span><span class="proj-card-stats small"><span>${prog.done}/${prog.total} tasks</span>${prog.overdue ? `<span class="danger-text">${prog.overdue} overdue</span>` : ''}${bud ? `<span>${money(bud.committed)} of ${money(bud.budget)}</span>` : ''}</span>` : ''}
    </button>`;
  }).join('');
  return `${pageHead('Projects', isEditor() ? 'Installs, upgrades and building work.' : 'What the production team is working on.', isEditor() ? `<button class="btn btn-primary" data-click="newProject">${icon('plus')} New project</button>` : '')}
    ${ps.length ? `<div class="proj-grid">${cards}</div>` : emptyState('No projects yet', 'Create a project to track tasks, cabling, budgets and contractors.')}
    ${ps.length ? `<section class="section"><h2 class="h2">Schedule</h2>${portfolioTimeline(ps)}</section>` : ''}`;
}

function portfolioTimeline(ps) {
  const dated = ps.filter((p) => p.start);
  if (!dated.length) return '<p class="muted">Add start and end dates to see the schedule.</p>';
  return ganttChart(dated.map((p) => ({ id: p.id, name: p.name, start: p.start, end: p.end || p.start, color: p.color, status: p.status, click: 'go', to: `/projects/${p.id}` })), 'pt');
}

// ---------------- Project detail ----------------
const PROJECT_TABS = [['overview', 'Overview', 'home'], ['tasks', 'Tasks', 'check'], ['cabling', 'Cabling', 'cable'], ['layouts', 'Room layouts', 'map'], ['budget', 'Budget', 'dollar'], ['contractors', 'Contractors', 'hardhat'], ['photos', 'Photos', 'camera'], ['activity', 'Activity', 'activity']];

function viewProject({ id, tab = 'overview', sub }) {
  const p = byId('projects', id);
  if (!p) return emptyState('Project not found', 'It may have been deleted.', '<button class="btn" data-click="go" data-to="/projects">All projects</button>');
  if (!isEditor()) return projectViewerPage(p);
  const t = tab === 'tasks' && sub ? 'tasks' : tab;
  const body = {
    overview: () => projectOverview(p), tasks: () => projectTasksTab(p), cabling: () => projectCabling(p), layouts: () => projectLayouts(p, sub),
    budget: () => projectBudget(p), contractors: () => projectContractors(p), photos: () => projectPhotos(p), activity: () => projectActivity(p),
  }[t]?.() ?? '';
  const drawer = tab === 'tasks' && sub ? taskDrawer(sub) : '';
  return `<div class="proj-head" style="--pc:${esc(p.color || '#d4d4d4')}">
      <button class="crumb" data-click="go" data-to="/projects">${icon('folder')} Projects</button>
      <div class="proj-title-row"><h1><span class="proj-dot"></span>${esc(p.name)}</h1>${pill(p.status || 'Planning')}<span class="spacer"></span>
      <button class="btn btn-sm btn-ghost" data-click="go" data-to="/projects/${p.id}/report">${icon('printer')} Report</button>
      <button class="btn btn-sm" data-click="editProject" data-id="${p.id}">${icon('edit')} Edit</button></div>
      <p class="mono small muted">${fmtDate(p.start, true)} → ${fmtDate(p.end, true)}${p.lead ? ` · Lead: ${esc(userName(p.lead))}` : ''}</p>
    </div>
    ${tabs(PROJECT_TABS.map(([k, l, ic]) => [k, l, ic, `/projects/${p.id}/${k}`]), t)}
    <div class="tab-body">${body}</div>${drawer}`;
}

function projectViewerPage(p) {
  return `${pageHead(p.name, esc(p.summary || ''), '', `<button class="crumb" data-click="go" data-to="/projects">${icon('folder')} Projects</button>`)}
    <div class="card pad"><dl class="kv"><dt>Status</dt><dd>${pill(p.status || 'Planning')}</dd><dt>Start</dt><dd>${fmtDate(p.start, true)}</dd><dt>Finish</dt><dd>${fmtDate(p.end, true)}</dd></dl>
    <p class="muted small">Budgets, tasks and contractor details are visible to production editors only.</p></div>`;
}

function projectOverview(p) {
  const prog = projectProgress(p.id);
  const bud = budgetCalc(p.id);
  const cables = list('cables').filter((c) => c.projectId === p.id);
  const cDone = cables.filter((c) => ['Tested', 'Labeled', 'Complete'].includes(c.status)).length;
  const punchOpen = list('punch').filter((x) => x.projectId === p.id && x.status !== 'Closed').length;
  const upcoming = projectTasks(p.id).filter((t) => t.due && t.status !== 'Done').sort((a, b) => a.due.localeCompare(b.due)).slice(0, 6);
  const team = [...new Set(projectTasks(p.id).flatMap((t) => t.assignees || []))];
  return `<div class="stats">
      ${stat('Tasks done', `${prog.pct}%`, `${prog.done} of ${prog.total}${prog.overdue ? ` · <span class="danger-text">${prog.overdue} overdue</span>` : ''}`, prog.pct)}
      ${stat('Budget committed', money(bud.committed), `of ${money(bud.budget)} · ${money(bud.remaining)} left`, bud.budget ? Math.min(100, (bud.committed / bud.budget) * 100) : 0, bud.remaining < 0 ? 'bad' : '')}
      ${stat('Cables tested', `${cDone}/${cables.length}`, 'tested, labeled or complete', cables.length ? (cDone / cables.length) * 100 : 0)}
      ${stat('Open punch items', punchOpen, 'across contractors')}
    </div>
    <div class="grid-2">
      <section class="card pad"><h2 class="h3">About this project</h2><p>${esc(p.summary || '')}</p>${p.description ? `<div class="prose small-prose">${md(p.description)}</div>` : ''}
        ${team.length ? `<h3 class="h4">People on tasks</h3><div class="avatars">${team.map((u) => avatar(u)).join('')}</div>` : ''}</section>
      <section class="card pad"><div class="row"><h2 class="h3">Coming up</h2><span class="spacer"></span><button class="btn btn-sm btn-ghost" data-click="go" data-to="/projects/${p.id}/tasks">All tasks</button></div>
        ${upcoming.length ? `<ul class="mini-list">${upcoming.map((t) => `<li><button class="mini-row" data-click="openTask" data-id="${t.id}"><span class="${isOverdue(t) ? 'danger-text' : 'muted'} mono small">${fmtDate(t.due)}</span><span class="grow">${esc(t.title)}</span>${pill(t.priority, 'p-' + slugify(t.priority))}</button></li>`).join('')}</ul>` : '<p class="muted">Nothing due.</p>'}
      </section>
    </div>`;
}
function stat(label, value, sub, pct, tone = '') {
  return `<div class="stat ${tone}"><div class="stat-label">${esc(label)}</div><div class="stat-value">${value}</div><div class="stat-sub small">${sub}</div>${pct !== undefined && pct !== null && typeof pct === 'number' ? `<span class="meter"><span style="width:${Math.max(0, Math.min(100, pct))}%"></span></span>` : ''}</div>`;
}

// ---------------- Tasks ----------------
function taskFilters() { return S.ui.taskFilter || {}; }
function filteredTasks(pid) {
  const f = taskFilters();
  const q = (f.q || '').toLowerCase();
  return projectTasks(pid).filter((t) => {
    if (!f.showDone && t.status === 'Done' && (S.ui.taskView || 'list') !== 'board') return false;
    if (f.who && !(t.assignees || []).includes(f.who)) return false;
    if (f.priority && t.priority !== f.priority) return false;
    if (f.label && !(t.labels || []).includes(f.label)) return false;
    if (q && !`${t.title} ${t.description || ''} ${(t.labels || []).join(' ')}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

function projectTasksTab(p) {
  const view = S.ui.taskView || 'list';
  const f = taskFilters();
  const labels = [...new Set(projectTasks(p.id).flatMap((t) => t.labels || []))].sort();
  const views = [['list', 'List', 'list'], ['board', 'Board', 'board'], ['calendar', 'Calendar', 'cal'], ['timeline', 'Timeline', 'gantt']];
  const tasks = filteredTasks(p.id);
  const body = { list: () => taskList(p, tasks), board: () => taskBoard(p, tasks), calendar: () => taskCalendar(p, tasks), timeline: () => taskTimeline(p, tasks) }[view]();
  return `<div class="task-bar">
      <div class="seg">${views.map(([k, l, ic]) => `<button class="seg-btn ${view === k ? 'on' : ''}" data-click="taskView" data-view="${k}">${icon(ic)}<span>${l}</span></button>`).join('')}</div>
      <label class="search-inline">${icon('search')}<input id="task-q" class="input" placeholder="Filter tasks" value="${esc(f.q || '')}" data-input="taskFilter" data-k="q"></label>
      <select id="task-who" class="input input-sm" data-change="taskFilter" data-k="who" aria-label="Assignee"><option value="">Anyone</option>${S.users.map((u) => `<option value="${u.id}" ${f.who === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select>
      <select id="task-pri" class="input input-sm" data-change="taskFilter" data-k="priority" aria-label="Priority"><option value="">Any priority</option>${HC.ENUMS.priority.map((x) => `<option ${f.priority === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
      <select id="task-lbl" class="input input-sm" data-change="taskFilter" data-k="label" aria-label="Label"><option value="">Any label</option>${labels.map((x) => `<option ${f.label === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
      ${view !== 'board' ? `<label class="check small"><input id="task-done" type="checkbox" data-change="taskFilter" data-k="showDone" ${f.showDone ? 'checked' : ''}> Show done</label>` : ''}
      <span class="spacer"></span>
      <button class="btn btn-sm btn-ghost" data-click="exportTasks" data-id="${p.id}">${icon('download')} CSV</button>
      <button class="btn btn-sm btn-primary" data-click="newTask" data-project="${p.id}">${icon('plus')} Task</button>
    </div>${body}`;
}

function taskMeta(t) {
  const subs = subtasksOf(t.id);
  const done = subs.filter((s) => s.status === 'Done').length;
  return `${(t.labels || []).map((l) => `<span class="label-chip" style="--h:${hue(l)}">${esc(l)}</span>`).join('')}
    ${subs.length ? `<span class="small muted" title="Subtasks">${icon('check', 'ico-xs')} ${done}/${subs.length}</span>` : ''}
    ${(t.attachments || []).length ? `<span class="small muted">${icon('clip', 'ico-xs')} ${t.attachments.length}</span>` : ''}
    ${list('comments').filter((c) => c.target === 'tasks:' + t.id).length ? `<span class="small muted">${icon('chat', 'ico-xs')} ${list('comments').filter((c) => c.target === 'tasks:' + t.id).length}</span>` : ''}`;
}

function taskList(p, tasks) {
  const top = tasks.filter((t) => !t.parentId || !tasks.some((x) => x.id === t.parentId));
  const groups = HC.ENUMS.taskStatus.map((s) => [s, top.filter((t) => t.status === s).sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9) || String(a.due || '9').localeCompare(String(b.due || '9')))]).filter(([, ts]) => ts.length);
  const row = (t, depth = 0) => `<div class="task-row ${t.status === 'Done' ? 'is-done' : ''}" style="--depth:${depth}">
      <button class="task-check ${t.status === 'Done' ? 'on' : ''}" data-click="toggleDone" data-id="${t.id}" aria-label="Mark ${t.status === 'Done' ? 'not done' : 'done'}">${icon('check')}</button>
      <button class="task-main" data-click="openTask" data-id="${t.id}"><span class="task-title">${esc(t.title)}</span><span class="task-meta">${taskMeta(t)}</span></button>
      <span class="task-side"><span class="avatars sm">${(t.assignees || []).map((u) => avatar(u, 'sm')).join('')}</span>
      <span class="mono small ${isOverdue(t) ? 'danger-text' : 'muted'}">${t.due ? fmtDate(t.due) : ''}</span>${pill(t.priority || 'Medium', 'p-' + slugify(t.priority || 'Medium'))}</span>
    </div>${tasks.filter((s) => s.parentId === t.id).map((s) => row(s, depth + 1)).join('')}`;
  return `<form class="quick-add" data-submit="quickTask" data-project="${p.id}"><input id="quick-task" class="input" placeholder="Add a task and press Enter…" autocomplete="off"><button class="btn btn-sm">Add</button></form>
    ${groups.length ? groups.map(([s, ts]) => `<section class="task-group"><h3 class="group-head">${pill(s)}<span class="muted small">${ts.length}</span></h3>${ts.map((t) => row(t)).join('')}</section>`).join('') : '<p class="muted pad">No tasks match these filters.</p>'}`;
}

function taskBoard(p, tasks) {
  const cols = HC.ENUMS.taskStatus;
  const top = tasks.filter((t) => !t.parentId);
  return `<div class="board" data-keep-scroll="board">${cols.map((s, ci) => {
    const ts = top.filter((t) => t.status === s).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9));
    return `<section class="board-col" data-drop-status="${esc(s)}"><header class="board-col-head">${pill(s)}<span class="muted small">${ts.length}</span><span class="spacer"></span><button class="icon-btn" data-click="newTask" data-project="${p.id}" data-status="${esc(s)}" aria-label="Add task to ${esc(s)}">${icon('plus')}</button></header>
      <div class="board-cards">${ts.map((t) => `<article class="board-card prio-${slugify(t.priority)}" draggable="true" data-drag-id="${t.id}">
        <button class="board-card-main" data-click="openTask" data-id="${t.id}"><span class="task-title">${esc(t.title)}</span><span class="task-meta">${taskMeta(t)}</span></button>
        <footer class="board-card-foot"><span class="avatars sm">${(t.assignees || []).map((u) => avatar(u, 'sm')).join('')}</span><span class="mono small ${isOverdue(t) ? 'danger-text' : 'muted'}">${t.due ? fmtDate(t.due) : ''}</span>
        ${ci < cols.length - 1 ? `<button class="icon-btn sm move-next" data-click="moveTask" data-id="${t.id}" data-status="${esc(cols[ci + 1])}" title="Move to ${esc(cols[ci + 1])}" aria-label="Move to ${esc(cols[ci + 1])}">${icon('chevron')}</button>` : ''}</footer>
      </article>`).join('')}</div></section>`;
  }).join('')}</div>`;
}

function taskCalendar(p, tasks) {
  const ym = S.ui.calMonth || localDate().slice(0, 7);
  const [y, m] = ym.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const startOffset = first.getDay();
  const days = new Date(y, m, 0).getDate();
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(`${ym}-${pad(d)}`);
  while (cells.length % 7) cells.push(null);
  const today = localDate();
  const label = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const prev = localDate(new Date(y, m - 2, 1)).slice(0, 7), next = localDate(new Date(y, m, 1)).slice(0, 7);
  const byDay = {};
  for (const t of tasks) if (t.due) (byDay[t.due] ||= []).push(t);
  const access = list('access').filter((a) => a.from);
  return `<div class="cal-head"><button class="icon-btn" data-click="calMonth" data-m="${prev}" aria-label="Previous month">‹</button><h3>${label}</h3><button class="icon-btn" data-click="calMonth" data-m="${next}" aria-label="Next month">›</button><button class="btn btn-sm btn-ghost" data-click="calMonth" data-m="${today.slice(0, 7)}">Today</button><span class="spacer"></span><button class="btn btn-sm" data-click="calendarSync" data-project="${p.id}">${icon('cal')} Sync to my calendar</button></div>
    <div class="cal" role="grid">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => `<div class="cal-dow">${d}</div>`).join('')}
    ${cells.map((d) => {
      if (!d) return '<div class="cal-cell out"></div>';
      const ts = byDay[d] || [];
      const acc = access.filter((a) => d >= a.from && d <= (a.to || a.from));
      return `<div class="cal-cell ${d === today ? 'today' : ''}"><button class="cal-day" data-click="newTask" data-project="${p.id}" data-due="${d}" aria-label="Add task on ${d}">${Number(d.slice(8))}</button>
        ${acc.length ? `<div class="cal-access" title="${esc(acc.map((a) => a.who).join(', '))}">${icon('hardhat', 'ico-xs')} ${acc.length}</div>` : ''}
        ${ts.map((t) => `<button class="cal-task prio-${slugify(t.priority)} ${t.status === 'Done' ? 'is-done' : ''}" data-click="openTask" data-id="${t.id}">${esc(t.title)}</button>`).join('')}</div>`;
    }).join('')}</div>
    <p class="muted small">Tap a date to add a task due that day. ${icon('hardhat', 'ico-xs')} marks contractor site access.</p>`;
}

function ganttChart(rows, key) {
  const zoom = S.ui.tlZoom || 'day';
  const dw = zoom === 'week' ? 9 : 30;
  const allDates = rows.flatMap((r) => [r.start, r.end]).filter(Boolean);
  let min = allDates.reduce((a, b) => (a < b ? a : b));
  let max = allDates.reduce((a, b) => (a > b ? a : b));
  const today = localDate();
  if (today < min) min = today; if (today > max) max = today;
  min = addDays(min, -3); max = addDays(max, 7);
  const span = daysBetween(min, max) + 1;
  const width = span * dw;
  const months = [];
  for (let i = 0; i < span; i++) { const d = addDays(min, i); if (i === 0 || d.endsWith('-01')) months.push([i, parseDay(d).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })]); }
  const ticks = [];
  for (let i = 0; i < span; i++) { const d = addDays(min, i); const dow = parseDay(d).getDay(); if (zoom === 'day' || dow === 0) ticks.push([i, zoom === 'day' ? Number(d.slice(8)) : fmtDate(d), dow === 0 || dow === 6]); }
  const todayX = daysBetween(min, today) * dw;
  return `<div class="gantt-tools"><div class="seg"><button class="seg-btn ${zoom === 'day' ? 'on' : ''}" data-click="tlZoom" data-z="day">Days</button><button class="seg-btn ${zoom === 'week' ? 'on' : ''}" data-click="tlZoom" data-z="week">Weeks</button></div></div>
  <div class="gantt" data-keep-scroll="gantt-${key}">
    <div class="gantt-names"><div class="gantt-corner"></div>${rows.map((r) => `<button class="gantt-name" data-click="${r.click}" data-id="${esc(r.id)}" data-to="${esc(r.to || '')}" style="--depth:${r.depth || 0}">${esc(r.name)}</button>`).join('')}</div>
    <div class="gantt-scroll" data-keep-scroll="gs-${key}"><div class="gantt-canvas" style="width:${width}px">
      <div class="gantt-months">${months.map(([i, l]) => `<span style="left:${i * dw}px">${esc(l)}</span>`).join('')}</div>
      <div class="gantt-ticks">${ticks.map(([i, l, we]) => `<span class="${we ? 'we' : ''}" style="left:${i * dw}px;width:${dw}px">${l}</span>`).join('')}</div>
      <div class="gantt-rows">${rows.map((r) => {
        const s = r.start || r.end; const e = r.end || r.start;
        const x = daysBetween(min, s) * dw; const w = Math.max(dw, (daysBetween(s, e) + 1) * dw);
        return `<div class="gantt-row"><button class="gantt-bar st-${slugify(r.status)} ${w < r.name.length * 7 + 16 ? 'narrow' : ''}" style="left:${x}px;width:${w}px;--bc:${esc(r.color || 'var(--accent)')}" data-click="${r.click}" data-id="${esc(r.id)}" data-to="${esc(r.to || '')}" title="${esc(r.name)}: ${fmtDate(s)} – ${fmtDate(e)}"><span>${esc(r.name)}</span></button></div>`;
      }).join('')}</div>
      <div class="gantt-today" style="left:${todayX + dw / 2}px"><span>Today</span></div>
    </div></div>
  </div>`;
}

function taskTimeline(p, tasks) {
  const rows = [];
  const add = (t, depth) => { if (t.due || t.start) rows.push({ id: t.id, name: t.title, start: t.start || t.due, end: t.due || t.start, status: t.status, depth, click: 'openTask', color: { Urgent: 'var(--p-urgent)', High: 'var(--p-high)', Medium: 'var(--accent)', Low: 'var(--p-low)' }[t.priority] }); tasks.filter((s) => s.parentId === t.id).forEach((s) => add(s, depth + 1)); };
  tasks.filter((t) => !t.parentId).sort((a, b) => String(a.start || a.due || '9').localeCompare(String(b.start || b.due || '9'))).forEach((t) => add(t, 0));
  if (!rows.length) return '<p class="muted pad">Give tasks a start or due date to place them on the timeline.</p>';
  return ganttChart(rows, 'tasks');
}

// ---------------- Task drawer ----------------
function taskDrawer(tid) {
  const t = byId('tasks', tid);
  if (!t) return '';
  const parent = t.parentId ? byId('tasks', t.parentId) : null;
  const subs = subtasksOf(t.id);
  const comments = list('comments').filter((c) => c.target === 'tasks:' + t.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const acts = list('activity').filter((a) => a.target === 'tasks:' + t.id).sort((a, b) => b.at.localeCompare(a.at));
  const tab = S.ui.drawerTab || 'comments';
  const editingDesc = S.ui.editDesc === t.id;
  return `<div class="drawer-wrap"><div class="drawer-backdrop" data-click="closeTask"></div>
  <aside class="drawer" role="dialog" aria-label="Task details" data-keep-scroll="drawer">
    <header class="drawer-head">
      ${parent ? `<button class="crumb" data-click="openTask" data-id="${parent.id}">↑ ${esc(parent.title)}</button>` : `<span class="muted small mono">${esc(byId('projects', t.projectId)?.name || '')}</span>`}
      <span class="spacer"></span>
      <button class="icon-btn" data-click="deleteTask" data-id="${t.id}" aria-label="Delete task">${icon('trash')}</button>
      <button class="icon-btn" data-click="closeTask" aria-label="Close">${icon('x')}</button>
    </header>
    <div class="drawer-body">
      <textarea id="t-title-${t.id}" class="title-input" rows="1" data-change="taskField" data-id="${t.id}" data-k="title" aria-label="Task title">${esc(t.title)}</textarea>
      <div class="props">
        <label class="prop"><span>Status</span><select id="t-status-${t.id}" class="input input-sm" data-change="taskField" data-id="${t.id}" data-k="status">${HC.ENUMS.taskStatus.map((s) => `<option ${t.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
        <label class="prop"><span>Priority</span><select id="t-pri-${t.id}" class="input input-sm" data-change="taskField" data-id="${t.id}" data-k="priority">${HC.ENUMS.priority.map((s) => `<option ${t.priority === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
        <label class="prop"><span>Start</span><input id="t-start-${t.id}" type="date" class="input input-sm" value="${esc(t.start || '')}" data-change="taskField" data-id="${t.id}" data-k="start"></label>
        <label class="prop"><span>Due</span><input id="t-due-${t.id}" type="date" class="input input-sm ${isOverdue(t) ? 'overdue' : ''}" value="${esc(t.due || '')}" data-change="taskField" data-id="${t.id}" data-k="due"></label>
        <div class="prop full"><span>Assignees</span><div class="chips-select">${S.users.map((u) => `<label class="chip-toggle"><input type="checkbox" data-change="taskAssign" data-id="${t.id}" value="${u.id}" ${(t.assignees || []).includes(u.id) ? 'checked' : ''}><span>${avatar(u.id, 'xs')} ${esc(u.name)}</span></label>`).join('')}</div></div>
        <label class="prop full"><span>Labels</span><input id="t-labels-${t.id}" class="input input-sm" list="lbl-dl" value="${esc((t.labels || []).join(', '))}" data-change="taskField" data-id="${t.id}" data-k="labels" placeholder="Audio, Cabling…"><datalist id="lbl-dl">${[...new Set(list('tasks').flatMap((x) => x.labels || []))].map((l) => `<option value="${esc(l)}">`).join('')}</datalist></label>
      </div>

      <section class="dsec"><div class="row"><h3 class="h4">Description</h3><span class="spacer"></span>${editingDesc ? `<button class="btn btn-xs btn-primary" data-click="saveDesc" data-id="${t.id}">Save</button><button class="btn btn-xs btn-ghost" data-click="editDesc" data-id="">Cancel</button>` : `<button class="btn btn-xs btn-ghost" data-click="editDesc" data-id="${t.id}">${icon('edit')} Edit</button>`}</div>
        ${editingDesc ? `<textarea id="t-desc-${t.id}" class="input mono" rows="6" data-md-upload="1">${esc(t.description || '')}</textarea>` : t.description ? `<div class="prose small-prose">${md(t.description)}</div>` : '<p class="muted small">No description.</p>'}</section>

      <section class="dsec"><h3 class="h4">Subtasks <span class="muted small">${subs.filter((s) => s.status === 'Done').length}/${subs.length}</span></h3>
        ${subs.map((s) => `<div class="sub-row"><button class="task-check sm ${s.status === 'Done' ? 'on' : ''}" data-click="toggleDone" data-id="${s.id}" aria-label="Toggle done">${icon('check')}</button><button class="sub-title ${s.status === 'Done' ? 'is-done' : ''}" data-click="openTask" data-id="${s.id}">${esc(s.title)}</button><span class="avatars sm">${(s.assignees || []).map((u) => avatar(u, 'xs')).join('')}</span><span class="mono small muted">${s.due ? fmtDate(s.due) : ''}</span></div>`).join('')}
        <form class="quick-add sm" data-submit="addSubtask" data-id="${t.id}"><input id="sub-new-${t.id}" class="input input-sm" placeholder="Add subtask…" autocomplete="off"><button class="btn btn-xs">Add</button></form></section>

      <section class="dsec"><div class="row"><h3 class="h4">Files</h3><span class="spacer"></span><button class="btn btn-xs" data-click="taskUpload" data-id="${t.id}" data-capture="1">${icon('camera')} Photo</button><button class="btn btn-xs" data-click="taskUpload" data-id="${t.id}">${icon('clip')} Upload</button><button class="btn btn-xs btn-ghost" data-click="taskLink" data-id="${t.id}">${icon('link')} Link</button></div>
        ${attachmentList(t.attachments, { removable: true, key: 'task:' + t.id })}</section>

      <section class="dsec">${tabs([['comments', `Comments (${comments.length})`], ['activity', 'History']], tab, 'drawerTab')}
        ${tab === 'comments' ? `<div class="comments">${comments.map(commentHTML).join('') || '<p class="muted small">No comments yet. Use @ to mention someone.</p>'}</div>
          <form class="composer" data-submit="postComment" data-target="tasks:${t.id}"><div class="mention-host"><textarea id="c-body-${t.id}" class="input" rows="2" placeholder="Write a comment… type @ to mention" data-input="mentionInput" data-md-upload="1"></textarea><div class="mention-pop" hidden></div></div><div class="row"><span class="muted small">Mentions send a notification to that person's phone.</span><span class="spacer"></span><button class="btn btn-sm btn-primary">Comment</button></div></form>`
        : `<ul class="activity">${acts.map(activityHTML).join('') || '<li class="muted small">No history yet.</li>'}<li class="act"><span class="act-dot"></span><span class="small muted">Created ${ago(t.createdAt)}${t.createdBy ? ' by ' + esc(userName(t.createdBy)) : ''}</span></li></ul>`}
      </section>
    </div>
  </aside></div>`;
}

function commentHTML(c) {
  return `<div class="comment">${avatar(c.authorId)}<div class="comment-body"><div class="comment-head"><b>${esc(c.authorName || userName(c.authorId))}</b><span class="muted small">${ago(c.createdAt)}</span>${c.authorId === S.user?.id ? `<button class="btn btn-xs btn-ghost" data-click="deleteComment" data-id="${c.id}">Delete</button>` : ''}</div><div class="prose small-prose">${md(c.body)}</div></div></div>`;
}
function activityHTML(a) {
  return `<li class="act"><span class="act-dot"></span><span class="small"><b>${esc(a.actorName)}</b> ${esc(a.text)} <span class="muted">${ago(a.at)}</span></span></li>`;
}

// ---------------- Cabling ----------------
function projectCabling(p) {
  const cables = list('cables').filter((c) => c.projectId === p.id);
  const byStatus = HC.ENUMS.cableStatus.map((s) => [s, cables.filter((c) => c.status === s).length]).filter(([, n]) => n);
  const byType = {};
  for (const c of cables) byType[c.type] = (byType[c.type] || 0) + num(c.lengthFt);
  return `<div class="row wrap gap-sm">${byStatus.map(([s, n]) => `<span class="count-chip">${pill(s)} ${n}</span>`).join('')}<span class="spacer"></span>
      <button class="btn btn-sm btn-ghost" data-click="cableLabels" data-id="${p.id}">${icon('printer')} Cable labels</button>
      <button class="btn btn-sm btn-primary" data-click="newDoc" data-coll="cables" data-project="${p.id}">${icon('plus')} Cable</button></div>
    ${dataTable('cables', cables, [
      { k: 'label', label: 'Cable ID', render: (c) => `<b class="mono">${esc(c.label)}</b>` },
      { k: 'type', label: 'Type', render: (c) => `<span class="cable-type" style="--h:${hue(c.type)}">${esc(c.type)}</span>` },
      { k: 'from', label: 'From' }, { k: 'to', label: 'To' },
      { k: 'lengthFt', label: 'Length (ft)', cls: 'num', sort: (c) => num(c.lengthFt) },
      { k: 'status', label: 'Status', render: (c) => pill(c.status) },
      { k: 'room', label: 'Room' }, { k: 'notes', label: 'Notes', cls: 'hide-sm' },
    ], { onRow: 'editDoc', csv: `cable-schedule-${slugify(p.name)}.csv`, empty: 'No cables in the schedule yet.' })}
    ${Object.keys(byType).length ? `<div class="card pad"><h3 class="h4">Footage by type</h3><div class="bars">${Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([t, ft]) => `<div class="bar-row"><span class="small">${esc(t)}</span><span class="bar"><span style="width:${(ft / Math.max(...Object.values(byType))) * 100}%;--h:${hue(t)}"></span></span><span class="mono small">${ft.toLocaleString()} ft</span></div>`).join('')}</div></div>` : ''}`;
}

// ---------------- Room layouts ----------------
const DEVICE_TYPES = {
  speaker: ['Speaker', 'S'], camera: ['Camera', 'C'], rack: ['Rack', 'R'], stagebox: ['Stage box', 'B'], display: ['Display', 'D'],
  projector: ['Projector', 'P'], mic: ['Mic / Input', 'M'], light: ['Light', 'L'], wap: ['Wireless AP', 'W'], floorbox: ['Floor box', 'F'], jack: ['Wall plate', 'J'], zone: ['Room / Zone', '▭'],
};
function projectLayouts(p, lid) {
  const layouts = list('layouts').filter((l) => l.projectId === p.id);
  if (lid && byId('layouts', lid)) return layoutEditor(byId('layouts', lid));
  return `<div class="row"><p class="muted">Plan where gear goes and how cables run between rooms. Upload a floor plan or draw zones.</p><span class="spacer"></span><button class="btn btn-sm btn-primary" data-click="newLayout" data-project="${p.id}">${icon('plus')} Layout</button></div>
    ${layouts.length ? `<div class="layout-cards">${layouts.map((l) => `<button class="layout-card" data-click="go" data-to="/projects/${p.id}/layouts/${l.id}">${layoutSVG(l, { mini: true })}<span class="layout-card-name">${esc(l.name)}</span><span class="muted small">${(l.items || []).filter((i) => i.type !== 'zone').length} devices · ${(l.runs || []).length} runs</span></button>`).join('')}</div>` : emptyState('No layouts yet', 'Create a room layout to place AV gear and draw cable runs.')}`;
}

let LAYOUT = null; // working copy while editing { id, doc, sel, connectFrom, mode }
function layoutSVG(l, { mini, sel } = {}) {
  const W = l.width || 1000, H = l.height || 640;
  const items = l.items || [];
  const pos = Object.fromEntries(items.map((i) => [i.id, i.type === 'zone' ? { x: i.x + i.w / 2, y: i.y + i.h / 2 } : { x: i.x, y: i.y }]));
  const bg = l.background ? `<image href="${esc(api.fileUrl(l.background))}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid meet" opacity="0.9"/>` : '';
  const runs = (l.runs || []).map((r) => {
    const a = pos[r.from], b = pos[r.to]; if (!a || !b) return '';
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const elbow = r.style === 'elbow' ? `M${a.x},${a.y} L${b.x},${a.y} L${b.x},${b.y}` : `M${a.x},${a.y} L${b.x},${b.y}`;
    const lx = r.style === 'elbow' ? b.x : mx, ly = r.style === 'elbow' ? a.y : my;
    return `<g class="run ${sel === r.id ? 'sel' : ''}" data-run="${r.id}"><path d="${elbow}" class="run-hit"/><path d="${elbow}" class="run-line" style="stroke:${esc(r.color || '#a3a3a3')}"/>${!mini && r.label ? `<g transform="translate(${lx},${ly})"><rect x="${-(r.label.length * 4 + 8)}" y="-11" width="${r.label.length * 8 + 16}" height="22" rx="4" class="run-tag"/><text class="run-text" text-anchor="middle" dy="4">${esc(r.label)}</text></g>` : ''}</g>`;
  }).join('');
  const zones = items.filter((i) => i.type === 'zone').map((z) => `<g class="item zone ${sel === z.id ? 'sel' : ''}" data-item="${z.id}"><rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" rx="6" class="zone-rect"/><text x="${z.x + 10}" y="${z.y + 22}" class="zone-text">${esc(z.label)}</text>${!mini && sel === z.id ? `<rect x="${z.x + z.w - 14}" y="${z.y + z.h - 14}" width="16" height="16" class="resize" data-resize="${z.id}"/>` : ''}</g>`).join('');
  const devs = items.filter((i) => i.type !== 'zone').map((d) => `<g class="item dev t-${d.type} ${sel === d.id ? 'sel' : ''} ${LAYOUT?.connectFrom === d.id ? 'from' : ''}" data-item="${d.id}" transform="translate(${d.x},${d.y})"><circle r="17" class="dev-circle"/><text class="dev-glyph" text-anchor="middle" dy="5">${esc(DEVICE_TYPES[d.type]?.[1] || '?')}</text>${mini ? '' : `<text class="dev-label" text-anchor="middle" y="34">${esc(d.label)}</text>`}</g>`).join('');
  return `<svg class="layout-svg ${mini ? 'mini' : ''}" viewBox="0 0 ${W} ${H}" ${mini ? '' : 'id="layout-svg"'} role="img" aria-label="${esc(l.name)}"><defs><pattern id="grid-${mini ? 'm' : 'e'}" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" class="grid-line"/></pattern></defs><rect width="${W}" height="${H}" class="layout-bg"/>${bg}<rect width="${W}" height="${H}" fill="url(#grid-${mini ? 'm' : 'e'})"/>${zones}${runs}${devs}</svg>`;
}

function layoutEditor(l) {
  if (!LAYOUT || LAYOUT.id !== l.id || !LAYOUT.dirty) LAYOUT = { id: l.id, doc: JSON.parse(JSON.stringify(l)), sel: LAYOUT?.id === l.id ? LAYOUT.sel : null, mode: LAYOUT?.id === l.id ? LAYOUT.mode : 'move', connectFrom: null };
  const d = LAYOUT.doc;
  const selItem = d.items.find((i) => i.id === LAYOUT.sel);
  const selRun = d.runs.find((r) => r.id === LAYOUT.sel);
  const cables = list('cables').filter((c) => c.projectId === d.projectId);
  const gear = list('gear');
  let panel = `<p class="muted small">Drag devices to move them. Use <b>Connect</b> then tap two devices to draw a cable run.</p>`;
  if (selItem) {
    panel = `<h3 class="h4">${esc(DEVICE_TYPES[selItem.type]?.[0] || 'Item')}</h3>
      <label class="field"><span class="label">Label</span><input id="li-label" class="input input-sm" value="${esc(selItem.label)}" data-change="layoutProp" data-k="label"></label>
      ${selItem.type !== 'zone' ? `<label class="field"><span class="label">Type</span><select id="li-type" class="input input-sm" data-change="layoutProp" data-k="type">${Object.entries(DEVICE_TYPES).filter(([k]) => k !== 'zone').map(([k, [n]]) => `<option value="${k}" ${selItem.type === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="field"><span class="label">Linked gear</span><select id="li-gear" class="input input-sm" data-change="layoutProp" data-k="gearId"><option value="">—</option>${gear.map((g) => `<option value="${g.id}" ${selItem.gearId === g.id ? 'selected' : ''}>${esc(g.name)} (${esc(g.model || '')})</option>`).join('')}</select></label>
      ${selItem.gearId && byId('gear', selItem.gearId) ? `<button class="btn btn-xs btn-ghost" data-click="go" data-to="/gear/${selItem.gearId}">Open gear item</button>` : ''}` : ''}
      <button class="btn btn-sm btn-ghost danger-text" data-click="layoutDelete">${icon('trash')} Remove</button>`;
  } else if (selRun) {
    const a = d.items.find((i) => i.id === selRun.from), b = d.items.find((i) => i.id === selRun.to);
    panel = `<h3 class="h4">Cable run</h3><p class="small muted">${esc(a?.label)} → ${esc(b?.label)}</p>
      <label class="field"><span class="label">Label</span><input id="lr-label" class="input input-sm" value="${esc(selRun.label || '')}" data-change="layoutProp" data-k="label"></label>
      <label class="field"><span class="label">Cable from schedule</span><select id="lr-cable" class="input input-sm" data-change="layoutProp" data-k="cableId"><option value="">—</option>${cables.map((c) => `<option value="${c.id}" ${selRun.cableId === c.id ? 'selected' : ''}>${esc(c.label)} · ${esc(c.type)}</option>`).join('')}</select></label>
      <label class="field"><span class="label">Colour</span><input id="lr-color" type="color" class="input color" value="${esc(selRun.color || '#a3a3a3')}" data-change="layoutProp" data-k="color"></label>
      <label class="field"><span class="label">Path</span><select id="lr-style" class="input input-sm" data-change="layoutProp" data-k="style"><option value="straight">Straight</option><option value="elbow" ${selRun.style === 'elbow' ? 'selected' : ''}>Right angle</option></select></label>
      <button class="btn btn-sm btn-ghost danger-text" data-click="layoutDelete">${icon('trash')} Remove run</button>`;
  }
  return `<div class="row wrap gap-sm"><button class="crumb" data-click="go" data-to="/projects/${d.projectId}/layouts">← Layouts</button><input id="lay-name" class="input input-sm grow-sm" value="${esc(d.name)}" data-change="layoutName" aria-label="Layout name"><span class="spacer"></span>
      <button class="btn btn-sm btn-ghost" data-click="layoutBg">${icon('image')} ${d.background ? 'Replace' : 'Upload'} floor plan</button>${d.background ? '<button class="btn btn-sm btn-ghost" data-click="layoutBgClear">Clear plan</button>' : ''}
      <button class="btn btn-sm btn-ghost hide-sm" data-click="print">${icon('printer')} PDF</button>
      <button class="btn btn-sm btn-ghost danger-text" data-click="deleteLayout" data-id="${d.id}">${icon('trash')}</button></div>
    <div class="layout-tools">
      <div class="seg"><button class="seg-btn ${LAYOUT.mode === 'move' ? 'on' : ''}" data-click="layoutMode" data-mode="move">Move</button><button class="seg-btn ${LAYOUT.mode === 'connect' ? 'on' : ''}" data-click="layoutMode" data-mode="connect">${icon('cable')} Connect</button></div>
      <select id="lay-add" class="input input-sm" data-change="layoutAdd" aria-label="Add device"><option value="">+ Add device…</option>${Object.entries(DEVICE_TYPES).map(([k, [n]]) => `<option value="${k}">${n}</option>`).join('')}</select>
      ${LAYOUT.mode === 'connect' ? `<span class="hint">${LAYOUT.connectFrom ? 'Now tap the device at the other end.' : 'Tap the device where the cable starts.'}</span>` : ''}
    </div>
    <div class="layout-edit"><div class="layout-stage">${layoutSVG(d, { sel: LAYOUT.sel })}</div><aside class="layout-panel card pad">${panel}
      <h3 class="h4">Legend</h3><ul class="legend">${Object.entries(DEVICE_TYPES).filter(([k]) => k !== 'zone').map(([k, [n, g]]) => `<li><span class="dev-chip t-${k}">${g}</span>${n}</li>`).join('')}</ul></aside></div>`;
}
async function saveLayout() {
  if (!LAYOUT) return;
  LAYOUT.dirty = false;
  const saved = await save('layouts', LAYOUT.doc, true);
  LAYOUT.doc = JSON.parse(JSON.stringify(saved));
}

// ---------------- Budget ----------------
function projectBudget(p) {
  const b = budgetCalc(p.id);
  const bom = list('bom').filter((x) => x.projectId === p.id);
  const pos = list('purchases').filter((x) => x.projectId === p.id);
  const pctC = b.budget ? (b.committed / b.budget) * 100 : 0;
  const pctS = b.budget ? (b.spent / b.budget) * 100 : 0;
  return `<div class="stats">
      ${stat('Budget', money(b.budget), `<button class="link-btn" data-click="editProject" data-id="${p.id}">Change budget</button>`)}
      ${stat('Planned (BOM)', money(b.planned), b.budget ? `${Math.round((b.planned / b.budget) * 100)}% of budget` : '', b.budget ? (b.planned / b.budget) * 100 : 0, b.planned > b.budget && b.budget ? 'warn' : '')}
      ${stat('Committed', money(b.committed), 'POs placed + signed scopes of work', pctC, pctC > 100 ? 'bad' : '')}
      ${stat('Spent', money(b.spent), 'Received goods + paid invoices', pctS)}
      ${stat('Remaining', money(b.remaining), 'Budget minus committed', null, b.remaining < 0 ? 'bad' : 'good')}
    </div>
    <div class="budget-bar" aria-label="Budget usage"><span class="bb-spent" style="width:${Math.min(100, pctS)}%"></span><span class="bb-committed" style="width:${Math.max(0, Math.min(100, pctC) - Math.min(100, pctS))}%"></span></div>
    <p class="small muted legend-row"><span class="key k-spent"></span> Spent <span class="key k-committed"></span> Committed <span class="key k-free"></span> Available</p>
    <section class="section"><h2 class="h3">By category</h2><div class="table-wrap"><table class="table"><thead><tr><th>Category</th><th class="num">Planned</th><th class="num">Committed</th><th class="num">Spent</th></tr></thead><tbody>${Object.entries(b.cats).map(([c, v]) => `<tr><td>${esc(c)}</td><td class="num mono">${money(v.planned)}</td><td class="num mono">${money(v.committed)}</td><td class="num mono">${money(v.spent)}</td></tr>`).join('')}</tbody></table></div></section>
    <section class="section"><div class="row"><h2 class="h3">Bill of materials</h2><span class="spacer"></span><button class="btn btn-sm btn-primary" data-click="newDoc" data-coll="bom" data-project="${p.id}">${icon('plus')} Item</button></div>
    ${dataTable('bom', bom, [
      { k: 'item', label: 'Item', render: (x) => `<b>${esc(x.item)}</b>${x.url ? ` <a href="${esc(safeUrl(x.url))}" target="_blank" rel="noopener" class="small">link</a>` : ''}` },
      { k: 'partNumber', label: 'Part #', render: (x) => `<span class="mono small">${esc(x.partNumber)}</span>` },
      { k: 'vendor', label: 'Vendor' }, { k: 'category', label: 'Category' },
      { k: 'qty', label: 'Qty', cls: 'num', sort: (x) => num(x.qty) },
      { k: 'unitCost', label: 'Unit', cls: 'num', render: (x) => money(x.unitCost), sort: (x) => num(x.unitCost) },
      { k: 'ext', label: 'Total', cls: 'num', render: (x) => `<b class="mono">${money(num(x.qty) * num(x.unitCost))}</b>`, csv: (x) => num(x.qty) * num(x.unitCost), sort: (x) => num(x.qty) * num(x.unitCost) },
      { k: 'status', label: 'Status', render: (x) => pill(x.status) },
    ], { onRow: 'editDoc', csv: `bom-${slugify(p.name)}.csv`, empty: 'Add the parts this project needs.' })}</section>
    <section class="section"><div class="row"><h2 class="h3">Purchase orders</h2><span class="spacer"></span><button class="btn btn-sm btn-primary" data-click="newDoc" data-coll="purchases" data-project="${p.id}">${icon('plus')} Purchase order</button></div>
    ${poTable(pos, `purchase-orders-${slugify(p.name)}.csv`)}</section>`;
}
function poTable(pos, csvName) {
  const b = budgetCalc('');
  return dataTable('pos', pos, [
    { k: 'poNumber', label: 'PO #', render: (x) => `<b class="mono">${esc(x.poNumber)}</b>` },
    { k: 'vendor', label: 'Vendor' }, { k: 'date', label: 'Date', render: (x) => fmtDate(x.date) },
    { k: 'project', label: 'Project', render: (x) => esc(byId('projects', x.projectId)?.name || ''), csv: (x) => byId('projects', x.projectId)?.name || '' },
    { k: 'total', label: 'Total', cls: 'num', render: (x) => money(b.lineTotal(x)), csv: (x) => b.lineTotal(x), sort: (x) => b.lineTotal(x) },
    { k: 'recv', label: 'Received', cls: 'num', render: (x) => { const t = b.lineTotal(x); const r = b.lineRecv(x); return `<span class="mono">${t ? Math.round((r / t) * 100) : 0}%</span>`; }, csv: (x) => b.lineRecv(x) },
    { k: 'status', label: 'Status', render: (x) => pill(x.status) },
    { k: 'act', label: '', render: (x) => !['Received', 'Cancelled'].includes(x.status) ? `<button class="btn btn-xs" data-click="receivePO" data-id="${x.id}">Receive</button>` : '', csv: () => '' },
  ], { onRow: 'editDoc', csv: csvName, empty: 'No purchase orders yet.' });
}

// ---------------- Contractors on a project ----------------
function projectContractors(p) {
  const sows = list('sow').filter((x) => x.projectId === p.id);
  const punch = list('punch').filter((x) => x.projectId === p.id);
  const inv = list('invoices').filter((x) => x.projectId === p.id);
  const cname = (id) => esc(byId('contractors', id)?.company || '');
  return `<section class="section"><div class="row"><h2 class="h3">Punch list</h2><span class="spacer"></span><button class="btn btn-sm btn-primary" data-click="newDoc" data-coll="punch" data-project="${p.id}">${icon('plus')} Punch item</button></div>
    ${punchTable(punch, `punch-list-${slugify(p.name)}.csv`)}</section>
    <section class="section"><div class="row"><h2 class="h3">Scopes of work</h2><span class="spacer"></span><button class="btn btn-sm" data-click="newDoc" data-coll="sow" data-project="${p.id}">${icon('plus')} Scope</button></div>
    ${dataTable('sow', sows, [{ k: 'title', label: 'Scope', render: (x) => `<b>${esc(x.title)}</b>` }, { k: 'contractorId', label: 'Contractor', render: (x) => cname(x.contractorId), csv: (x) => byId('contractors', x.contractorId)?.company }, { k: 'value', label: 'Value', cls: 'num', render: (x) => money(x.value), sort: (x) => num(x.value) }, { k: 'start', label: 'Dates', render: (x) => `${fmtDate(x.start)} – ${fmtDate(x.end)}` }, { k: 'status', label: 'Status', render: (x) => pill(x.status) }], { onRow: 'viewSow', csv: 'scopes-of-work.csv', search: false })}</section>
    <section class="section"><div class="row"><h2 class="h3">Invoices</h2><span class="spacer"></span><button class="btn btn-sm" data-click="newDoc" data-coll="invoices" data-project="${p.id}">${icon('plus')} Invoice</button></div>
    ${invoiceTable(inv, 'invoices.csv')}</section>`;
}
function punchTable(rows, csvName) {
  return dataTable('punch', rows, [
    { k: 'description', label: 'Item', render: (x) => `<b>${esc(x.description)}</b>${(x.photos || []).length ? ` <span class="muted small">${icon('camera', 'ico-xs')} ${x.photos.length}</span>` : ''}` },
    { k: 'location', label: 'Location' },
    { k: 'contractorId', label: 'Contractor', render: (x) => esc(byId('contractors', x.contractorId)?.company || ''), csv: (x) => byId('contractors', x.contractorId)?.company },
    { k: 'due', label: 'Due', render: (x) => `<span class="${x.due && x.due < localDate() && x.status !== 'Closed' ? 'danger-text' : ''}">${fmtDate(x.due)}</span>` },
    { k: 'status', label: 'Status', render: (x) => pill(x.status) },
  ], { onRow: 'editDoc', csv: csvName, empty: 'No punch items. Add one while walking the site.' });
}
function invoiceTable(rows, csvName) {
  return dataTable('inv', rows, [
    { k: 'number', label: 'Invoice #', render: (x) => `<b class="mono">${esc(x.number)}</b>` },
    { k: 'contractorId', label: 'Contractor', render: (x) => esc(byId('contractors', x.contractorId)?.company || ''), csv: (x) => byId('contractors', x.contractorId)?.company },
    { k: 'date', label: 'Date', render: (x) => fmtDate(x.date) }, { k: 'dueDate', label: 'Due', render: (x) => fmtDate(x.dueDate) },
    { k: 'amount', label: 'Amount', cls: 'num', render: (x) => `<b class="mono">${money(x.amount)}</b>`, sort: (x) => num(x.amount) },
    { k: 'status', label: 'Status', render: (x) => pill(x.status) },
  ], { onRow: 'editDoc', csv: csvName, empty: 'No invoices yet.', search: false });
}

// ---------------- Photos ----------------
function projectPhotos(p) {
  const photos = list('photos').filter((x) => x.projectId === p.id).sort((a, b) => String(b.takenAt).localeCompare(String(a.takenAt)));
  const loc = S.ui.photoLoc || '';
  const locs = [...new Set(photos.map((x) => x.location).filter(Boolean))];
  const shown = loc ? photos.filter((x) => x.location === loc) : photos;
  return `<div class="row wrap gap-sm"><button class="btn btn-primary" data-click="addPhotos" data-project="${p.id}" data-capture="1">${icon('camera')} Take photo</button><button class="btn" data-click="addPhotos" data-project="${p.id}">${icon('image')} Upload</button>
      <select id="photo-loc" class="input input-sm" data-change="photoLoc" aria-label="Location"><option value="">All locations</option>${locs.map((l) => `<option ${l === loc ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
      <input id="photo-loc-default" class="input input-sm" placeholder="Location for new photos" value="${esc(S.ui.photoLocDefault || '')}" data-change="photoLocDefault"><span class="spacer"></span>
      <button class="btn btn-sm btn-ghost" data-click="exportPhotos" data-id="${p.id}">${icon('download')} CSV</button></div>
    ${shown.length ? `<div class="photo-grid">${shown.map((x) => `<figure class="photo"><button class="photo-img" data-click="viewFile" data-json="${esc(JSON.stringify({ fileId: x.fileId, name: x.caption || x.name, mime: x.mime, size: x.size, at: x.takenAt }))}">${isVideo(x.mime) ? `<video src="${esc(api.fileUrl(x.fileId))}" muted preload="metadata"></video>` : `<img src="${esc(api.fileUrl(x.fileId))}" alt="${esc(x.caption || '')}" loading="lazy">`}</button><figcaption><button class="link-btn" data-click="editDoc" data-coll="photos" data-id="${x.id}">${esc(x.caption || 'Add caption')}</button><span class="muted small">${esc(x.location || '')} · ${ago(x.takenAt)} · ${esc(userName(x.by))}</span></figcaption></figure>`).join('')}</div>` : emptyState('No photos yet', 'Document the site as you work. Photos from your phone camera upload straight here.')}`;
}

// ---------------- Activity ----------------
function projectActivity(p) {
  const acts = list('activity').filter((a) => a.projectId === p.id).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 200);
  return acts.length ? `<ul class="activity big">${acts.map((a) => `<li class="act"><span class="act-dot"></span><span class="small"><b>${esc(a.actorName)}</b> ${esc(a.text)} <span class="muted">· ${esc(a.noun || '')} </span>${a.target?.startsWith('tasks:') ? `<button class="link-btn" data-click="openTask" data-id="${a.target.slice(6)}">${esc(a.name)}</button>` : `“${esc(a.name)}”`} <span class="muted">${ago(a.at)}</span></span></li>`).join('')}</ul>` : emptyState('No activity yet', 'Changes to tasks, budgets, cables and contractors show up here.');
}

// ---------------- Printable report ----------------
function viewProjectReport({ id }) {
  const p = byId('projects', id);
  if (!p) return emptyState('Project not found', '');
  const b = budgetCalc(id);
  const ts = projectTasks(id);
  const cables = list('cables').filter((c) => c.projectId === id);
  const punch = list('punch').filter((x) => x.projectId === id);
  const bom = list('bom').filter((x) => x.projectId === id);
  const t = (rows, heads) => `<table class="table report-table"><thead><tr>${heads.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  return `<div class="report">
    <div class="report-actions no-print"><button class="btn" data-click="go" data-to="/projects/${id}">← Back</button><button class="btn btn-primary" data-click="print">${icon('printer')} Print / Save PDF</button></div>
    <header><div class="eyebrow">${esc(settings().orgName || 'HCC Production')} · Project report · ${fmtDate(localDate(), true)}</div><h1>${esc(p.name)}</h1><p>${esc(p.summary || '')}</p><p class="mono small">${fmtDate(p.start, true)} → ${fmtDate(p.end, true)} · ${esc(p.status)}</p></header>
    <h2>Budget</h2>${t([[money(b.budget), money(b.planned), money(b.committed), money(b.spent), money(b.remaining)]], ['Budget', 'Planned', 'Committed', 'Spent', 'Remaining'])}
    <h2>Tasks (${ts.filter((x) => x.status === 'Done').length}/${ts.length} done)</h2>${t(ts.map((x) => [esc(x.title), esc(x.status), esc(x.priority), esc((x.assignees || []).map(userName).join(', ')), fmtDate(x.due)]), ['Task', 'Status', 'Priority', 'Assigned', 'Due'])}
    <h2>Bill of materials</h2>${t(bom.map((x) => [esc(x.item), esc(x.vendor), x.qty, money(x.unitCost), money(num(x.qty) * num(x.unitCost)), esc(x.status)]), ['Item', 'Vendor', 'Qty', 'Unit', 'Total', 'Status'])}
    <h2>Cable schedule</h2>${t(cables.map((c) => [esc(c.label), esc(c.type), esc(c.from), esc(c.to), c.lengthFt ?? '', esc(c.status)]), ['ID', 'Type', 'From', 'To', 'Ft', 'Status'])}
    <h2>Punch list</h2>${t(punch.map((x) => [esc(x.description), esc(x.location), esc(byId('contractors', x.contractorId)?.company || ''), esc(x.status)]), ['Item', 'Location', 'Contractor', 'Status'])}
  </div>`;
}
