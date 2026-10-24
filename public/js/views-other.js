'use strict';
/* Dashboard, roster, gear, contractors, purchasing, notifications, settings, profile, login. */

// ---------------- Login ----------------
function loginView() {
  if (DEMO) {
    return `<div class="login"><div class="login-card">
      <div class="brand big">${brandMark()}<span>${esc(settings().orgName || 'HCC Production')}</span></div>
      <h1>Pick a demo account</h1>
      <p class="muted">This preview runs entirely in your browser. Each account shows what that role can see and do.</p>
      <div class="demo-users">${DEMO_USERS.map((u) => `<button class="demo-user" data-click="demoLogin" data-u="${esc(u.username)}">${avatar(u.id)}<span><b>${esc(u.name)}</b><span class="muted small">${esc(u.role)} · ${{ admin: 'everything, incl. users and integrations', editor: 'projects, budgets, gear, contractors', viewer: 'SOPs, roster and project status only' }[u.role]}</span></span></button>`).join('')}
      <button class="demo-user" data-click="go" data-to="/sops"><span class="avatar" style="--h:200">?</span><span><b>Public visitor</b><span class="muted small">not signed in · public SOPs only</span></span></button></div>
    </div></div>`;
  }
  return `<div class="login"><form class="login-card" data-submit="login">
    <div class="brand big">${brandMark()}<span>${esc(settings().orgName || 'HCC Production')}</span></div>
    <h1>Sign in</h1>
    <div class="field"><label class="label" for="login-u">Username</label><input id="login-u" class="input input-lg" autocomplete="username" autocapitalize="off" required autofocus></div>
    <div class="field"><label class="label" for="login-p">Password</label><input id="login-p" class="input input-lg" type="password" autocomplete="current-password" required></div>
    <button class="btn btn-primary btn-lg full-w">Sign in</button>
    ${settings().publicSops !== false ? '<button type="button" class="btn btn-ghost full-w" data-click="go" data-to="/sops">Read public SOPs without signing in</button>' : ''}
  </form></div>`;
}
const brandMark = () => `<svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><rect x="2" y="2" width="28" height="28" rx="7" class="bm-bg"/><path d="M16 7v18M9 13h14" class="bm-cross"/><circle cx="24" cy="24" r="3" class="bm-dot"/></svg>`;

// ---------------- Dashboard ----------------
function viewHome() {
  if (!S.user) return loginView();
  const me = S.user;
  const person = byId('people', me.personId);
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const unread = list('notifications').filter((n) => !n.read).length;
  const people = [...list('people')].sort((a, b) => String(b.lastCheckIn).localeCompare(String(a.lastCheckIn)));
  const sops = [...list('sops')].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 4);
  const checkin = `<section class="card pad checkin-card"><div class="row"><div><div class="eyebrow">Your status</div>${person ? `<div class="checkin-status">${statusDot(person.status)} <b>${esc(person.status)}</b> <span class="muted small">· checked in ${ago(person.lastCheckIn)}</span></div>${person.statusNote ? `<p class="small muted">${esc(person.statusNote)}</p>` : ''}` : '<p class="small muted">Your account is not linked to the roster yet.</p>'}</div><span class="spacer"></span>${person ? `<button class="btn btn-primary" data-click="checkin">${icon('pin')} Check in</button>` : ''}</div></section>`;

  if (!isEditor()) {
    return `${pageHead(`${greet}, ${esc(me.name.split(' ')[0])}`, `${unread ? `${unread} unread notification${unread > 1 ? 's' : ''}` : 'Here is what the production team is up to.'}`)}
      ${checkin}
      <div class="grid-2"><section class="card pad"><h2 class="h3">Recently updated SOPs</h2><ul class="mini-list">${sops.map((p) => `<li><button class="mini-row" data-click="go" data-to="/sops/${p.id}"><span class="grow">${esc(p.title)}</span><span class="muted small">${ago(p.updatedAt)}</span></button></li>`).join('')}</ul></section>
      <section class="card pad"><h2 class="h3">Team</h2>${rosterMini(people)}</section></div>
      <section class="section"><h2 class="h3">Projects</h2>${portfolioTimeline(list('projects'))}</section>`;
  }

  const mine = list('tasks').filter((t) => (t.assignees || []).includes(me.id) && t.status !== 'Done').sort((a, b) => String(a.due || '9').localeCompare(String(b.due || '9')));
  const overdue = mine.filter(isOverdue);
  const week = mine.filter((t) => t.due && !isOverdue(t) && t.due <= addDays(localDate(), 7));
  const active = list('projects').filter((p) => p.status === 'Active' || p.status === 'Planning');
  const acts = [...list('activity')].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);
  const openPunch = list('punch').filter((x) => x.status !== 'Closed').length;
  const insuranceSoon = list('contractors').filter((c) => c.insuranceExpires && c.insuranceExpires <= addDays(localDate(), 30));
  const taskRow = (t) => `<li><button class="mini-row" data-click="openTask" data-id="${t.id}"><span class="mono small ${isOverdue(t) ? 'danger-text' : 'muted'}">${t.due ? fmtDate(t.due) : '—'}</span><span class="grow">${esc(t.title)}<span class="muted small"> · ${esc(byId('projects', t.projectId)?.name || '')}</span></span>${pill(t.priority, 'p-' + slugify(t.priority))}</button></li>`;
  return `${pageHead(`${greet}, ${esc(me.name.split(' ')[0])}`, `${mine.length} open task${mine.length === 1 ? '' : 's'} assigned to you${overdue.length ? ` · <span class="danger-text">${overdue.length} overdue</span>` : ''}${unread ? ` · <button class="link-btn" data-click="go" data-to="/notifications">${unread} unread</button>` : ''}`, `<button class="btn" data-click="quickPhoto">${icon('camera')} Site photo</button>`)}
    ${checkin}
    ${insuranceSoon.length ? `<aside class="callout callout-warning compact"><div class="callout-ico"></div><div class="callout-body">Contractor insurance expiring soon: ${insuranceSoon.map((c) => `<button class="link-btn" data-click="go" data-to="/contractors/${c.id}">${esc(c.company)}</button> (${fmtDate(c.insuranceExpires)})`).join(', ')}</div></aside>` : ''}
    <div class="grid-2">
      <section class="card pad"><h2 class="h3">My tasks</h2>
        ${overdue.length ? `<h3 class="h5 danger-text">Overdue</h3><ul class="mini-list">${overdue.map(taskRow).join('')}</ul>` : ''}
        ${week.length ? `<h3 class="h5">Due this week</h3><ul class="mini-list">${week.map(taskRow).join('')}</ul>` : ''}
        ${mine.filter((t) => !overdue.includes(t) && !week.includes(t)).length ? `<h3 class="h5">Later</h3><ul class="mini-list">${mine.filter((t) => !overdue.includes(t) && !week.includes(t)).slice(0, 6).map(taskRow).join('')}</ul>` : ''}
        ${!mine.length ? '<p class="muted">Nothing assigned to you right now.</p>' : ''}
      </section>
      <section class="card pad"><h2 class="h3">Team roster</h2>${rosterMini(people)}<button class="btn btn-sm btn-ghost" data-click="go" data-to="/roster">Full roster</button></section>
    </div>
    <section class="section"><div class="row"><h2 class="h3">Active projects</h2><span class="spacer"></span><span class="muted small">${openPunch} open punch item${openPunch === 1 ? '' : 's'}</span></div>
      <div class="proj-grid">${active.map((p) => { const pr = projectProgress(p.id); return `<button class="proj-card" data-click="go" data-to="/projects/${p.id}" style="--pc:${esc(p.color || '#0f766e')}"><span class="proj-card-top"><span class="proj-dot"></span>${pill(p.status)}</span><span class="proj-card-name">${esc(p.name)}</span><span class="meter"><span style="width:${pr.pct}%"></span></span><span class="proj-card-stats small"><span>${pr.done}/${pr.total} tasks</span>${pr.overdue ? `<span class="danger-text">${pr.overdue} overdue</span>` : ''}</span></button>`; }).join('')}</div></section>
    <div class="grid-2">
      <section class="card pad"><h2 class="h3">Recent activity</h2><ul class="activity">${acts.map((a) => `<li class="act"><span class="act-dot"></span><span class="small"><b>${esc(a.actorName)}</b> ${esc(a.text)} <span class="muted">· ${esc(a.noun || '')} “${esc(a.name)}” · ${ago(a.at)}</span></span></li>`).join('') || '<li class="muted small">Nothing yet.</li>'}</ul></section>
      <section class="card pad"><h2 class="h3">Recently updated SOPs</h2><ul class="mini-list">${sops.map((p) => `<li><button class="mini-row" data-click="go" data-to="/sops/${p.id}"><span class="grow">${esc(p.title)}</span><span class="muted small">${ago(p.updatedAt)}</span></button></li>`).join('')}</ul></section>
    </div>`;
}

// ---------------- Roster ----------------
const STATUS_TONE = { Available: 'good', 'On Site': 'accent', 'Serving Sunday': 'accent', Away: 'warn', Unavailable: 'bad' };
const statusDot = (s) => `<span class="status-dot tone-${STATUS_TONE[s] || 'muted'}" aria-hidden="true"></span>`;
function freshness(iso) {
  if (!iso) return 'stale';
  const d = (Date.now() - new Date(iso)) / 864e5;
  return d < 2 ? 'fresh' : d < 8 ? 'recent' : 'stale';
}
function rosterMini(people) {
  return `<ul class="roster-mini">${people.slice(0, 6).map((p) => `<li>${avatar(p.userId || p.name)}<span class="grow"><b>${esc(p.name)}</b><span class="muted small"> ${esc(p.roles.map((r) => byId('teamRoles', r)?.name).filter(Boolean).join(', '))}</span></span>${statusDot(p.status)}<span class="small">${esc(p.status)}</span><span class="muted small checkin-${freshness(p.lastCheckIn)}">${ago(p.lastCheckIn)}</span></li>`).join('')}</ul>`;
}
function viewRoster() {
  const people = [...list('people')].sort((a, b) => a.name.localeCompare(b.name));
  const roles = list('teamRoles');
  const counts = HC.ENUMS.personStatus.map((s) => [s, people.filter((p) => p.status === s).length]).filter(([, n]) => n);
  const mine = byId('people', S.user?.personId);
  return `${pageHead('Roster', `${people.length} people on the production team · ${counts.map(([s, n]) => `${n} ${s.toLowerCase()}`).join(' · ')}`, `${mine ? `<button class="btn btn-primary" data-click="checkin">${icon('pin')} Check in</button>` : ''}${isEditor() ? `<button class="btn" data-click="newDoc" data-coll="people">${icon('plus')} Person</button>` : ''}`)}
    <div class="people-grid">${people.map((p) => `<article class="person-card">
      <header>${avatar(p.userId || p.name, 'lg')}<div class="grow"><h3>${esc(p.name)}</h3><div class="role-tags">${(p.roles || []).map((r) => { const ro = byId('teamRoles', r); return ro ? `<span class="role-tag" style="--rc:${esc(ro.color)}">${esc(ro.name)}</span>` : ''; }).join('')}</div></div>${isEditor() ? `<button class="icon-btn" data-click="editDoc" data-coll="people" data-id="${p.id}" aria-label="Edit ${esc(p.name)}">${icon('edit')}</button>` : ''}</header>
      <div class="person-status">${statusDot(p.status)}<b>${esc(p.status || 'Unknown')}</b>${p.statusNote ? `<span class="muted small">— ${esc(p.statusNote)}</span>` : ''}</div>
      <div class="person-foot small"><span class="checkin-${freshness(p.lastCheckIn)}">${icon('pin', 'ico-xs')} Last check-in ${ago(p.lastCheckIn)}</span>${isEditor() ? `<button class="link-btn" data-click="checkinFor" data-id="${p.id}">Update</button>` : ''}</div>
      ${p.phone || p.email ? `<div class="person-contact small mono selectable">${p.phone ? `<a href="tel:${esc(p.phone.replace(/[^\d+]/g, ''))}">${esc(p.phone)}</a>` : ''} ${p.email ? `<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>` : ''}</div>` : ''}
    </article>`).join('')}</div>
    <section class="section"><div class="row"><h2 class="h3">Production roles</h2><span class="spacer"></span>${isEditor() ? `<button class="btn btn-sm" data-click="newDoc" data-coll="teamRoles">${icon('plus')} Role</button>` : ''}</div>
      <div class="roles-grid">${roles.map((r) => { const ps = people.filter((p) => (p.roles || []).includes(r.id)); return `<article class="role-card" style="--rc:${esc(r.color)}"><header><h3>${esc(r.name)}</h3>${isEditor() ? `<button class="icon-btn sm" data-click="editDoc" data-coll="teamRoles" data-id="${r.id}" aria-label="Edit role">${icon('edit')}</button>` : ''}</header><p class="small muted">${esc(r.description || '')}</p><div class="small">${ps.length ? ps.map((p) => `${statusDot(p.status)} ${esc(p.name)}`).join('<br>') : '<span class="danger-text">No one assigned</span>'}</div></article>`; }).join('')}</div></section>`;
}

// ---------------- Gear ----------------
function viewGear() {
  const cat = S.ui.gearCat || '';
  const all = list('gear');
  const rows = cat ? all.filter((g) => g.category === cat) : all;
  const cats = HC.ENUMS.gearCategory.filter((c) => all.some((g) => g.category === c));
  return `${pageHead('Gear inventory', `${all.length} items · ${all.filter((g) => g.status === 'In Service').length} in service`, `<button class="btn btn-primary" data-click="newDoc" data-coll="gear">${icon('plus')} Gear</button>`)}
    <div class="chip-row"><button class="chip ${!cat ? 'on' : ''}" data-click="gearCat" data-c="">All</button>${cats.map((c) => `<button class="chip ${cat === c ? 'on' : ''}" data-click="gearCat" data-c="${esc(c)}">${esc(c)} <span class="muted">${all.filter((g) => g.category === c).length}</span></button>`).join('')}</div>
    ${dataTable('gear', rows, [
      { k: 'name', label: 'Name', render: (g) => `<b>${esc(g.name)}</b><div class="muted small">${esc(g.manufacturer || '')} ${esc(g.model || '')}</div>`, csv: (g) => g.name },
      { k: 'manufacturer', label: 'Make', cls: 'hide-col' }, { k: 'model', label: 'Model', cls: 'hide-col' },
      { k: 'serial', label: 'Serial #', render: (g) => `<span class="mono small">${esc(g.serial)}</span>` },
      { k: 'assetTag', label: 'Asset tag', render: (g) => `<span class="mono small">${esc(g.assetTag)}</span>` },
      { k: 'firmware', label: 'Firmware', render: (g) => `<span class="mono small">${esc(g.firmware || '')}</span>${g.firmwareUpdated ? `<div class="muted small">${fmtDate(g.firmwareUpdated)}</div>` : ''}` },
      { k: 'ip', label: 'IP', render: (g) => `<span class="mono small">${esc(g.ip || '')}</span>`, cls: 'hide-sm' },
      { k: 'location', label: 'Location' }, { k: 'status', label: 'Status', render: (g) => pill(g.status) },
      { k: 'configs', label: 'Backups', render: (g) => (g.configs || []).length ? `${icon('file', 'ico-xs')} ${g.configs.length}` : '<span class="muted">—</span>', csv: (g) => (g.configs || []).length },
    ], { onRow: 'openGear', csv: 'gear-inventory.csv', empty: 'Add your first piece of gear.' })}`;
}
function viewGearItem({ id }) {
  const g = byId('gear', id);
  if (!g) return emptyState('Gear not found', '', '<button class="btn" data-click="go" data-to="/gear">Back to gear</button>');
  const kv = [['Category', g.category], ['Manufacturer', g.manufacturer], ['Model', g.model], ['Serial number', g.serial, 1], ['Asset tag', g.assetTag, 1], ['Location', g.location], ['IP address', g.ip, 1], ['MAC address', g.mac, 1], ['Purchased', fmtDate(g.purchaseDate, true)], ['Warranty until', fmtDate(g.warranty, true)]];
  const configs = [...(g.configs || [])].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return `${pageHead(g.name, `${esc(g.manufacturer || '')} ${esc(g.model || '')}`, `<button class="btn btn-ghost" data-click="gearLabel" data-id="${g.id}">${icon('printer')} Label</button><button class="btn" data-click="editDoc" data-coll="gear" data-id="${g.id}">${icon('edit')} Edit</button>`, `<button class="crumb" data-click="go" data-to="/gear">${icon('box')} Gear</button>`)}
    <div class="grid-2">
      <section class="card pad"><div class="row">${pill(g.status)}<span class="spacer"></span></div><dl class="kv">${kv.filter(([, v]) => v).map(([k, v, mono]) => `<dt>${k}</dt><dd class="${mono ? 'mono selectable' : ''}">${esc(v)}</dd>`).join('')}</dl>${g.notes ? `<p class="small">${esc(g.notes)}</p>` : ''}</section>
      <section class="card pad fw-card"><div class="eyebrow">Firmware label</div>${gearLabelHTML(g)}
        <form class="row gap-sm" data-submit="firmwareUpdate" data-id="${g.id}"><input id="fw-new" class="input input-sm mono" placeholder="New version, e.g. ${esc(g.firmware || '1.0')}" required><button class="btn btn-sm">Log update</button></form>
        ${(g.firmwareHistory || []).length ? `<ul class="activity">${[...g.firmwareHistory].reverse().map((h) => `<li class="act"><span class="act-dot"></span><span class="small mono">${esc(h.from || '?')} → ${esc(h.to)}</span><span class="muted small"> ${fmtDate(h.at)} · ${esc(userName(h.by))}</span></li>`).join('')}</ul>` : ''}</section>
    </div>
    <section class="section card pad"><div class="row"><h2 class="h3">Config backups</h2><span class="spacer"></span><button class="btn btn-sm btn-primary" data-click="gearConfig" data-id="${g.id}">${icon('clip')} Upload backup</button></div>
      <p class="muted small">Upload show files, exported configs or screenshots before every firmware update. Text-based configs open in the viewer.</p>
      ${configs.length ? `<ul class="files">${configs.map((f) => `<li class="file"><span class="file-ico">${icon('file')}</span><button class="file-name" data-click="viewFile" data-json="${esc(JSON.stringify(f))}">${esc(f.name)}</button><span class="muted small">${f.firmware ? `fw <span class="mono">${esc(f.firmware)}</span> · ` : ''}${fmtSize(f.size)} · ${fmtDate(f.at)}</span><button class="icon-btn" data-click="removeAttachment" data-key="gear:${g.id}:configs" data-i="${(g.configs || []).indexOf(f)}" aria-label="Remove">${icon('x')}</button></li>`).join('')}</ul>` : '<p class="muted">No backups yet.</p>'}</section>
    <section class="section card pad"><div class="row"><h2 class="h3">Photos</h2><span class="spacer"></span><button class="btn btn-sm" data-click="gearPhoto" data-id="${g.id}" data-capture="1">${icon('camera')} Take photo</button><button class="btn btn-sm" data-click="gearPhoto" data-id="${g.id}">${icon('image')} Upload</button></div>
      ${(g.photos || []).length ? `<div class="photo-grid sm">${g.photos.map((f) => `<button class="photo-img" data-click="viewFile" data-json="${esc(JSON.stringify(f))}"><img src="${esc(fileHref(f))}" alt="${esc(f.name)}" loading="lazy"></button>`).join('')}</div>` : '<p class="muted">Photograph the rear panel, serial plate and rack position.</p>'}</section>`;
}
function gearLabelHTML(g) {
  return `<div class="gear-label"><div class="gl-top"><span class="gl-org">${esc(settings().orgName || 'HCC Production')}</span><span class="gl-tag mono">${esc(g.assetTag || '')}</span></div><div class="gl-name">${esc(g.name)}</div><div class="gl-grid mono"><span>MODEL</span><b>${esc(g.model || '—')}</b><span>S/N</span><b>${esc(g.serial || '—')}</b><span>IP</span><b>${esc(g.ip || '—')}</b><span>FW</span><b>${esc(g.firmware || '—')}${g.firmwareUpdated ? ` · ${esc(g.firmwareUpdated)}` : ''}</b></div></div>`;
}

// ---------------- Contractors ----------------
function viewContractors() {
  const cs = list('contractors');
  const soon = addDays(localDate(), 30);
  return `${pageHead('Contractors', 'Directory, scopes of work, site access, punch lists and invoices.', `<button class="btn btn-primary" data-click="newDoc" data-coll="contractors">${icon('plus')} Contractor</button>`)}
    ${cs.length ? `<div class="con-grid">${cs.map((c) => {
      const open = list('punch').filter((x) => x.contractorId === c.id && x.status !== 'Closed').length;
      const owed = list('invoices').filter((x) => x.contractorId === c.id && x.status !== 'Paid').reduce((s, i) => s + num(i.amount), 0);
      return `<button class="con-card" data-click="go" data-to="/contractors/${c.id}"><span class="con-trade eyebrow">${esc(c.trade || '')}</span><span class="con-name">${esc(c.company)}</span><span class="small">${esc(c.contact || '')}</span><span class="con-stats small"><span>${open} open punch</span><span>${money(owed)} unpaid</span>${c.insuranceExpires ? `<span class="${c.insuranceExpires <= soon ? 'danger-text' : 'muted'}">Insurance ${c.insuranceExpires < localDate() ? 'expired' : 'to'} ${fmtDate(c.insuranceExpires)}</span>` : ''}</span></button>`;
    }).join('')}</div>` : emptyState('No contractors yet', 'Add the companies that work on your building.')}
    <section class="section"><h2 class="h3">Upcoming site access</h2>${accessTable(list('access').filter((a) => (a.to || a.from) >= localDate()))}</section>
    <section class="section"><h2 class="h3">All open punch items</h2>${punchTable(list('punch').filter((x) => x.status !== 'Closed'), 'punch-list.csv')}</section>`;
}
function accessTable(rows) {
  return dataTable('access', rows, [
    { k: 'who', label: 'Who', render: (a) => `<b>${esc(a.who)}</b><div class="muted small">${esc(byId('contractors', a.contractorId)?.company || '')}</div>`, csv: (a) => a.who },
    { k: 'from', label: 'Dates', render: (a) => `${fmtDate(a.from)} – ${fmtDate(a.to)}`, csv: (a) => `${a.from} - ${a.to}` },
    { k: 'hours', label: 'Hours' }, { k: 'areas', label: 'Areas' }, { k: 'badge', label: 'Keys / badge', render: (a) => `<span class="mono small">${esc(a.badge)}</span>` },
    { k: 'approvedBy', label: 'Approved by', cls: 'hide-sm' },
  ], { onRow: 'editDoc', csv: 'site-access.csv', empty: 'No site access scheduled.', search: false });
}
function viewContractor({ id }) {
  const c = byId('contractors', id);
  if (!c) return emptyState('Contractor not found', '', '<button class="btn" data-click="go" data-to="/contractors">Back</button>');
  const sows = list('sow').filter((x) => x.contractorId === id);
  const acc = list('access').filter((x) => x.contractorId === id);
  const punch = list('punch').filter((x) => x.contractorId === id);
  const inv = list('invoices').filter((x) => x.contractorId === id);
  const expired = c.insuranceExpires && c.insuranceExpires < localDate();
  return `${pageHead(c.company, esc(c.trade || ''), `<button class="btn" data-click="editDoc" data-coll="contractors" data-id="${c.id}">${icon('edit')} Edit</button>`, `<button class="crumb" data-click="go" data-to="/contractors">${icon('hardhat')} Contractors</button>`)}
    ${expired ? `<aside class="callout callout-danger compact"><div class="callout-ico"></div><div class="callout-body"><b>Insurance expired ${fmtDate(c.insuranceExpires, true)}.</b> Get a new certificate before granting site access.</div></aside>` : ''}
    <section class="card pad"><dl class="kv"><dt>Contact</dt><dd>${esc(c.contact || '')}</dd><dt>Phone</dt><dd class="mono selectable">${esc(c.phone || '')}</dd><dt>Email</dt><dd class="mono selectable">${esc(c.email || '')}</dd><dt>Rate</dt><dd>${esc(c.rate || '')}</dd><dt>Insurance until</dt><dd>${fmtDate(c.insuranceExpires, true)}</dd></dl>${c.notes ? `<p class="small">${esc(c.notes)}</p>` : ''}${(c.attachments || []).length ? `<h3 class="h5">Documents</h3>${attachmentList(c.attachments)}` : ''}</section>
    <section class="section"><div class="row"><h2 class="h3">Scopes of work</h2><span class="spacer"></span><button class="btn btn-sm" data-click="newDoc" data-coll="sow" data-contractor="${c.id}">${icon('plus')} Scope</button></div>
      ${sows.length ? sows.map((s) => `<article class="card pad sow"><div class="row"><h3 class="h4">${esc(s.title)}</h3>${pill(s.status)}<span class="spacer"></span><span class="mono">${money(s.value)}</span><button class="btn btn-xs btn-ghost" data-click="editDoc" data-coll="sow" data-id="${s.id}">${icon('edit')}</button></div><p class="muted small">${esc(byId('projects', s.projectId)?.name || '')} · ${fmtDate(s.start)} – ${fmtDate(s.end)}</p><div class="prose small-prose">${md(s.body)}</div></article>`).join('') : '<p class="muted">No scopes of work yet.</p>'}</section>
    <section class="section"><div class="row"><h2 class="h3">Site access</h2><span class="spacer"></span><button class="btn btn-sm" data-click="newDoc" data-coll="access" data-contractor="${c.id}">${icon('plus')} Access window</button></div>${accessTable(acc)}</section>
    <section class="section"><div class="row"><h2 class="h3">Punch list</h2><span class="spacer"></span><button class="btn btn-sm" data-click="newDoc" data-coll="punch" data-contractor="${c.id}">${icon('plus')} Punch item</button></div>${punchTable(punch, `punch-${slugify(c.company)}.csv`)}</section>
    <section class="section"><div class="row"><h2 class="h3">Invoices</h2><span class="spacer"></span><button class="btn btn-sm" data-click="newDoc" data-coll="invoices" data-contractor="${c.id}">${icon('plus')} Invoice</button></div>${invoiceTable(inv, `invoices-${slugify(c.company)}.csv`)}</section>`;
}

// ---------------- Purchasing (all projects) ----------------
function viewPurchasing() {
  const ps = list('projects');
  const pos = list('purchases');
  const rows = ps.map((p) => ({ p, b: budgetCalc(p.id) }));
  const tot = rows.reduce((a, { b }) => ({ budget: a.budget + b.budget, committed: a.committed + b.committed, spent: a.spent + b.spent }), { budget: 0, committed: 0, spent: 0 });
  const awaiting = pos.filter((x) => ['Ordered', 'Partially Received', 'Approved'].includes(x.status));
  return `${pageHead('Budgets & purchasing', 'Every project budget, purchase order and delivery in one place.', `<button class="btn btn-primary" data-click="newDoc" data-coll="purchases">${icon('plus')} Purchase order</button>`)}
    <div class="stats">${stat('Total budget', money(tot.budget), `${ps.length} projects`)}${stat('Committed', money(tot.committed), tot.budget ? `${Math.round((tot.committed / tot.budget) * 100)}% of budget` : '', tot.budget ? (tot.committed / tot.budget) * 100 : 0)}${stat('Spent', money(tot.spent), 'received + paid')}${stat('Awaiting delivery', awaiting.length, 'purchase orders')}</div>
    <section class="section"><h2 class="h3">Project budgets</h2><div class="table-wrap"><table class="table resp"><thead><tr><th>Project</th><th class="num">Budget</th><th class="num">Planned</th><th class="num">Committed</th><th class="num">Spent</th><th class="num">Remaining</th><th>Used</th></tr></thead><tbody>${rows.map(({ p, b }) => `<tr class="clickable" data-click="go" data-to="/projects/${p.id}/budget"><td data-label="Project"><b>${esc(p.name)}</b></td><td class="num mono" data-label="Budget">${money(b.budget)}</td><td class="num mono" data-label="Planned">${money(b.planned)}</td><td class="num mono" data-label="Committed">${money(b.committed)}</td><td class="num mono" data-label="Spent">${money(b.spent)}</td><td class="num mono ${b.remaining < 0 ? 'danger-text' : ''}" data-label="Remaining">${money(b.remaining)}</td><td data-label="Used"><span class="meter wide"><span style="width:${b.budget ? Math.min(100, (b.committed / b.budget) * 100) : 0}%"></span></span></td></tr>`).join('')}</tbody></table></div></section>
    <section class="section"><h2 class="h3">Purchase orders</h2>${poTable(pos, 'purchase-orders.csv')}</section>`;
}

// ---------------- Notifications ----------------
function viewNotifications() {
  const ns = [...list('notifications')].sort((a, b) => b.at.localeCompare(a.at));
  return `${pageHead('Notifications', 'Mentions, assignments and due-date reminders.', `${ns.some((n) => !n.read) ? '<button class="btn" data-click="readAll">Mark all read</button>' : ''}<button class="btn btn-ghost" data-click="go" data-to="/profile">${icon('bell')} Phone alerts</button>`)}
    ${ns.length ? `<ul class="notif-list">${ns.map((n) => `<li><button class="notif ${n.read ? '' : 'unread'}" data-click="openNotif" data-id="${n.id}"><span class="notif-dot"></span><span class="grow"><b>${esc(n.title)}</b><span class="small">${esc(n.body)}</span></span><span class="muted small">${ago(n.at)}</span></button></li>`).join('')}</ul>` : emptyState('All caught up', 'You will see mentions, new assignments and due-date reminders here.')}`;
}

// ---------------- Profile ----------------
function viewProfile() {
  const u = S.user;
  const s = settings();
  return `${pageHead('Profile', `Signed in as <b>${esc(u.username)}</b> · ${esc(u.role)}`, `<button class="btn btn-ghost" data-click="logout">${icon('logout')} Sign out</button>`)}
    <div class="grid-2">
      <form class="card pad form-grid one" data-submit="saveProfile">
        <h2 class="h3">Your details</h2>
        <div class="field"><label class="label" for="pf-name">Name</label><input id="pf-name" class="input" value="${esc(u.name)}"></div>
        <div class="field"><label class="label" for="pf-email">Email</label><input id="pf-email" class="input" type="email" value="${esc(u.email || '')}"></div>
        ${!DEMO ? `<h3 class="h4">Change password</h3><div class="field"><label class="label" for="pf-cur">Current password</label><input id="pf-cur" class="input" type="password" autocomplete="current-password"></div><div class="field"><label class="label" for="pf-new">New password</label><input id="pf-new" class="input" type="password" autocomplete="new-password" minlength="8"></div>` : ''}
        <button class="btn btn-primary">Save</button>
      </form>
      <section class="card pad">
        <h2 class="h3">${icon('bell')} Notifications on your phone</h2>
        <p class="small">The app sends push alerts through <b>ntfy</b>, a free app for iPhone and Android. You get alerts for mentions, new assignments and due-date reminders.</p>
        <ol class="small numbered"><li>Install <b>ntfy</b> from the App Store or Google Play.</li><li>Tap <b>+</b> and subscribe to your private topic below${s.ntfyServer && !/ntfy\.sh/.test(s.ntfyServer) ? ` on server <span class="mono">${esc(s.ntfyServer)}</span>` : ''}.</li><li>Press <b>Send test</b>.</li></ol>
        <div class="field"><label class="label" for="pf-topic">Your ntfy topic</label><div class="row gap-sm"><input id="pf-topic" class="input mono" value="${esc(u.ntfyTopic || '')}" placeholder="hcc-yourname-x8k2"><button class="btn btn-sm" type="button" data-click="genTopic">Generate</button></div><p class="help">Anyone who knows the topic can read it, so keep it random.</p></div>
        <div class="row gap-sm"><button class="btn btn-primary" data-click="saveTopic">Save topic</button><button class="btn" data-click="testNotify">Send test</button></div>
      </section>
    </div>`;
}

// ---------------- Settings (admin) ----------------
function viewSettings({ tab = 'general' }) {
  const s = settings();
  const T = [['general', 'General'], ['users', 'Users & roles'], ['integrations', 'Notifications & calendar'], ['api', 'Webhooks & API']];
  let body = '';
  if (tab === 'general') {
    body = `<form class="card pad form-grid one" data-submit="saveSettings">
      <div class="field"><label class="label" for="st-org">Organization name</label><input id="st-org" name="orgName" class="input" value="${esc(s.orgName || '')}"></div>
      <div class="field"><label class="label" for="st-url">App address</label><input id="st-url" name="appUrl" class="input mono" value="${esc(s.appUrl || '')}" placeholder="https://production.hopechurch.org"><p class="help">Used for links in phone notifications, Slack and calendar events.</p></div>
      <div class="field"><label class="check"><input id="st-pub" type="checkbox" name="publicSops" ${s.publicSops !== false ? 'checked' : ''}> <span>Let anyone read SOPs marked public, without signing in</span></label></div>
      <div class="field"><label class="label" for="st-groups">SOP sections (one per line, in order)</label><textarea id="st-groups" name="sopGroups" class="input" rows="5">${esc((s.sopGroups || []).join('\n'))}</textarea></div>
      <button class="btn btn-primary">Save</button></form>
      ${DEMO ? `<section class="card pad"><h2 class="h3">Demo data</h2><p class="small muted">Everything in this preview lives in your browser. Reset puts the sample data back.</p><button class="btn btn-danger" data-click="resetDemo">Reset demo data</button></section>` : ''}`;
  } else if (tab === 'users') {
    onAfter(loadUsers);
    body = `<section class="card pad"><div class="row"><h2 class="h3">Users</h2><span class="spacer"></span><button class="btn btn-primary btn-sm" data-click="editUser" data-id="">${icon('plus')} User</button></div><div id="users-box"><p class="muted">Loading…</p></div></section>
      <section class="card pad"><h2 class="h3">What each role can do</h2><div class="table-wrap"><table class="table"><thead><tr><th>Area</th><th>Public</th><th>Viewer</th><th>Editor</th><th>Admin</th></tr></thead><tbody>
      ${[['SOPs marked public', 'Read', 'Read', 'Edit', 'Edit'], ['Team-only SOPs', '—', 'Read', 'Edit', 'Edit'], ['Roster & check-in', '—', 'Read + own check-in', 'Edit', 'Edit'], ['Project status & schedule', '—', 'Read', 'Edit', 'Edit'], ['Tasks, cabling, layouts, photos', '—', '—', 'Edit', 'Edit'], ['Budgets, purchasing, invoices', '—', '—', 'Edit', 'Edit'], ['Contractors & gear', '—', '—', 'Edit', 'Edit'], ['Users, integrations, API keys', '—', '—', '—', 'Edit']].map((r) => `<tr>${r.map((c, i) => `<td class="${i ? 'small' : ''}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`;
  } else if (tab === 'integrations') {
    const cal = calendarUrl();
    body = `<form class="card pad form-grid one" data-submit="saveSettings">
      <h2 class="h3">Phone push (ntfy)</h2>
      <div class="field"><label class="label" for="st-ntfy">ntfy server</label><input id="st-ntfy" name="ntfyServer" class="input mono" value="${esc(s.ntfyServer || 'https://ntfy.sh')}"><p class="help">Use https://ntfy.sh, or run your own ntfy container next to this app.</p></div>
      <div class="field"><label class="label" for="st-ntfyt">ntfy access token (optional)</label><input id="st-ntfyt" name="ntfyToken" class="input mono" value="${esc(s.ntfyToken || '')}" placeholder="tk_…"></div>
      <div class="field"><label class="label" for="st-team">Team-wide ntfy topic (optional)</label><input id="st-team" name="channelNtfyTopic" class="input mono" value="${esc(s.channelNtfyTopic || '')}" placeholder="hcc-production-team"></div>
      <div class="field"><label class="label" for="st-rem">Due-date reminder window (hours before due)</label><input id="st-rem" name="reminderHours" type="number" class="input" value="${esc(s.reminderHours ?? 24)}"></div>
      <h2 class="h3">Slack & Microsoft Teams</h2>
      <div class="field"><label class="label" for="st-slack">Slack incoming webhook URL</label><input id="st-slack" name="slackWebhook" class="input mono" value="${esc(s.slackWebhook || '')}" placeholder="https://hooks.slack.com/services/…"></div>
      <div class="field"><label class="label" for="st-teams">Teams webhook URL</label><input id="st-teams" name="teamsWebhook" class="input mono" value="${esc(s.teamsWebhook || '')}" placeholder="https://….webhook.office.com/…"></div>
      <div class="field"><label class="label" for="st-ev">Events to post (blank = all)</label><input id="st-ev" name="channelEvents" class="input mono" value="${esc(s.channelEvents || '')}" placeholder="task.created, task.completed, comment.created, purchase.status"></div>
      <div class="row gap-sm"><button class="btn btn-primary">Save</button><button type="button" class="btn" data-click="testIntegrations">Send test message</button></div>
    </form>
    <section class="card pad"><h2 class="h3">${icon('cal')} Calendar sync</h2><p class="small">Subscribe from Google Calendar (Other calendars → From URL), Apple Calendar (File → New Calendar Subscription) or Outlook (Add calendar → From internet). Task due dates, project dates and contractor site access appear automatically.</p>
      <div class="row gap-sm"><input id="cal-url" class="input mono" readonly value="${esc(cal)}"><button class="btn btn-sm" data-click="copy" data-text="${esc(cal)}">Copy</button></div>
      <button class="btn btn-sm btn-ghost" data-click="rotateCal">Reset link (old subscriptions stop working)</button></section>
    <section class="card pad"><h2 class="h3">${icon('link')} File storage links</h2><p class="small">Any file field accepts links to Google Drive, Dropbox, OneDrive/SharePoint or Box, next to uploaded files. Use links for big drawings and show files you already keep in shared storage.</p></section>`;
  } else if (tab === 'api') {
    onAfter(loadKeys);
    const hooks = list('webhooks');
    body = `<section class="card pad"><div class="row"><h2 class="h3">Outgoing webhooks</h2><span class="spacer"></span><button class="btn btn-sm btn-primary" data-click="newDoc" data-coll="webhooks">${icon('plus')} Webhook</button></div>
      <p class="small muted">The server POSTs JSON to these URLs when things change. Use them with Zapier, Make, n8n, Home Assistant or your own scripts.</p>
      ${hooks.length ? `<ul class="mini-list">${hooks.map((h) => `<li><button class="mini-row" data-click="editDoc" data-coll="webhooks" data-id="${h.id}"><span class="grow mono small">${esc(h.url)}</span><span class="small muted">${esc(h.events || '*')}</span>${h.active ? pill('Active', 'good') : pill('Paused', 'muted')}</button></li>`).join('')}</ul>` : '<p class="muted">No webhooks yet.</p>'}
      <details class="accordion"><summary>Event names and payload</summary><div class="accordion-body small">
      <p>Events: <code>&lt;collection&gt;.created</code>, <code>.updated</code>, <code>.deleted</code> for tasks, projects, purchases, bom, cables, punch, invoices, gear, sops, people… plus <code>people.checkin</code> and <code>notification.created</code>. Use <code>*</code> for everything or <code>tasks.*</code> for one collection.</p>
      <div class="code"><pre><code>${esc('POST https://your-endpoint\nX-HCC-Event: tasks.updated\nX-HCC-Signature: sha256=<hmac of body with your secret>\n\n{ "event": "tasks.updated", "at": "2026-10-24T15:00:00Z",\n  "data": { "id": "tsk_…", "title": "…", "status": "Done" },\n  "actor": { "id": "usr_…", "name": "Edwin" } }')}</code></pre></div></div></details></section>
    <section class="card pad"><div class="row"><h2 class="h3">API keys</h2><span class="spacer"></span><button class="btn btn-sm btn-primary" data-click="newKey">${icon('plus')} API key</button></div><div id="keys-box"><p class="muted">Loading…</p></div>
      <details class="accordion"><summary>REST API reference</summary><div class="accordion-body small"><p>Send <code>Authorization: Bearer hcc_…</code>. Every collection works the same way:</p>
      <div class="code"><pre><code>${esc(`GET    /api/c/tasks            list\nGET    /api/c/tasks/:id        read one\nPUT    /api/c/tasks/:id        create or replace (JSON body)\nDELETE /api/c/tasks/:id        delete\nPOST   /api/files?name=x.png   upload (raw body) → { id }\nGET    /files/:id              download\nPOST   /api/checkin            { status, note, personId }\nGET    /calendar.ics?token=…   calendar feed\n\nCollections: ${Object.keys(HC.ACCESS).filter((k) => !['notifications', 'settings', 'webhooks'].includes(k)).join(', ')}\n\ncurl -X PUT ${location.origin}/api/c/tasks/tsk_new1 \\\n  -H "Authorization: Bearer hcc_…" -H "Content-Type: application/json" \\\n  -d '{"projectId":"proj_sanctuary","title":"Replace DMX node","status":"To Do","priority":"High","due":"2026-11-01"}'`)}</code></pre></div></div></details></section>`;
  }
  return `${pageHead('Settings', 'Organization, users, notifications and integrations.')}${tabs(T.map(([k, l]) => [k, l, '', `/settings/${k}`]), tab)}<div class="tab-body stack">${body}</div>`;
}
function calendarUrl(projectId) {
  const s = settings();
  const base = (s.appUrl || location.origin).replace(/\/$/, '');
  return `${DEMO ? 'https://your-server' : base}/calendar.ics?token=${s.calendarToken || ''}${projectId ? `&project=${projectId}` : ''}`;
}
async function loadUsers() {
  const box = $('#users-box'); if (!box) return;
  try {
    const users = await api.listUsers();
    S.adminUsers = users;
    box.innerHTML = `<div class="table-wrap"><table class="table resp"><thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Roster link</th><th>Phone alerts</th><th></th></tr></thead><tbody>${users.map((u) => `<tr><td data-label="Name">${avatar(u.id, 'sm')} <b>${esc(u.name)}</b></td><td data-label="Username" class="mono small">${esc(u.username)}</td><td data-label="Role">${pill(u.role)}</td><td data-label="Roster">${esc(byId('people', u.personId)?.name || '—')}</td><td data-label="Alerts">${u.ntfyTopic ? pill('On', 'good') : '<span class="muted small">Off</span>'}</td><td>${!DEMO && !u.hasPassword ? '<span class="small warn-text">No password</span> ' : ''}<button class="btn btn-xs" data-click="editUser" data-id="${u.id}">Edit</button></td></tr>`).join('')}</tbody></table></div>`;
  } catch (e) { box.innerHTML = `<p class="danger-text">${esc(e.message)}</p>`; }
}
async function loadKeys() {
  const box = $('#keys-box'); if (!box) return;
  try {
    const keys = await api.listKeys();
    box.innerHTML = keys.length ? `<ul class="mini-list">${keys.map((k) => `<li class="mini-row"><span class="grow"><b>${esc(k.name)}</b> <span class="mono small muted">${esc(k.prefix)}…</span></span>${pill(k.role)}<span class="muted small">${k.last_used ? 'used ' + ago(k.last_used) : 'never used'}</span><button class="btn btn-xs btn-ghost danger-text" data-click="deleteKey" data-id="${k.id}">Revoke</button></li>`).join('')}</ul>` : '<p class="muted">No API keys yet.</p>';
  } catch (e) { box.innerHTML = `<p class="danger-text">${esc(e.message)}</p>`; }
}
