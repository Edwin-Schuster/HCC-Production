/*
 * Shared logic for the HCC Production app.
 * Loaded by the browser (as a classic script) and by the Node server (via import).
 * Everything hangs off globalThis.HCC so both sides can use it without a bundler.
 */
(function () {
  const ROLE_RANK = { public: 0, viewer: 1, editor: 2, admin: 3 };

  // Who can read / write each collection. "own" = only rows where userId matches.
  const ACCESS = {
    sops:          { read: 'public', write: 'editor' },
    teamRoles:     { read: 'viewer', write: 'editor' },
    people:        { read: 'viewer', write: 'editor' },
    projects:      { read: 'viewer', write: 'editor' },
    tasks:         { read: 'editor', write: 'editor' },
    comments:      { read: 'editor', write: 'editor' },
    activity:      { read: 'editor', write: 'editor' },
    cables:        { read: 'editor', write: 'editor' },
    layouts:       { read: 'editor', write: 'editor' },
    photos:        { read: 'editor', write: 'editor' },
    bom:           { read: 'editor', write: 'editor' },
    purchases:     { read: 'editor', write: 'editor' },
    contractors:   { read: 'editor', write: 'editor' },
    sow:           { read: 'editor', write: 'editor' },
    access:        { read: 'editor', write: 'editor' },
    punch:         { read: 'editor', write: 'editor' },
    invoices:      { read: 'editor', write: 'editor' },
    gear:          { read: 'editor', write: 'editor' },
    notifications: { read: 'own',    write: 'own' },
    settings:      { read: 'public', write: 'admin' },
    webhooks:      { read: 'admin',  write: 'admin' },
  };

  // Fields a viewer (public team view) may see on a project. Budgets etc. are stripped.
  const VIEWER_PROJECT_FIELDS = ['id', 'name', 'status', 'start', 'end', 'color', 'summary', 'updatedAt'];
  // Settings fields anyone may see; the rest are admin only.
  const PUBLIC_SETTINGS_FIELDS = ['id', 'orgName', 'publicSops', 'sopGroups', 'appUrl'];

  function can(role, coll, op) {
    const rule = ACCESS[coll];
    if (!rule) return false;
    const need = rule[op];
    if (need === 'own') return ROLE_RANK[role] >= 1;
    return (ROLE_RANK[role] ?? 0) >= ROLE_RANK[need];
  }

  function redact(role, coll, doc) {
    if (!doc) return doc;
    if (coll === 'projects' && ROLE_RANK[role] < 2) return pick(doc, VIEWER_PROJECT_FIELDS);
    if (coll === 'settings' && ROLE_RANK[role] < 3) return pick(doc, ROLE_RANK[role] >= 2 ? [...PUBLIC_SETTINGS_FIELDS, 'calendarToken'] : PUBLIC_SETTINGS_FIELDS);
    if (coll === 'sops' && ROLE_RANK[role] < 1 && !doc.public) return null;
    return doc;
  }

  function pick(o, keys) {
    const r = {};
    for (const k of keys) if (o[k] !== undefined) r[k] = o[k];
    return r;
  }

  const ENUMS = {
    taskStatus: ['Backlog', 'To Do', 'In Progress', 'Blocked', 'Review', 'Done'],
    priority: ['Urgent', 'High', 'Medium', 'Low'],
    projectStatus: ['Planning', 'Active', 'On Hold', 'Complete'],
    personStatus: ['Available', 'On Site', 'Serving Sunday', 'Away', 'Unavailable'],
    cableType: ['Cat6', 'Cat6A', 'Fiber SM', 'Fiber MM', '12G-SDI', '3G-SDI', 'HDMI', 'XLR', 'Speaker 12/2', 'Speaker 12/4', 'DMX', 'Power', 'Other'],
    cableStatus: ['Planned', 'Pulled', 'Terminated', 'Tested', 'Labeled', 'Complete'],
    bomStatus: ['Needed', 'Quoted', 'Ordered', 'Received', 'Installed'],
    poStatus: ['Draft', 'Submitted', 'Approved', 'Ordered', 'Partially Received', 'Received', 'Cancelled'],
    gearStatus: ['In Service', 'Spare', 'Out for Repair', 'Retired'],
    gearCategory: ['Audio', 'Video', 'Lighting', 'Network', 'Streaming', 'Computer', 'Power', 'Rigging', 'Other'],
    punchStatus: ['Open', 'In Progress', 'Ready for Review', 'Closed'],
    invoiceStatus: ['Received', 'Approved', 'Paid', 'Disputed'],
    sowStatus: ['Draft', 'Sent', 'Signed', 'In Progress', 'Complete'],
    budgetCategory: ['Audio', 'Video', 'Lighting', 'Network', 'Cabling', 'Labor', 'Furniture', 'Software', 'Other'],
  };

  function uid(prefix) {
    let s = '';
    const bytes = new Uint8Array(10);
    (globalThis.crypto || require('crypto').webcrypto).getRandomValues(bytes);
    for (const b of bytes) s += (b % 36).toString(36);
    return (prefix ? prefix + '_' : '') + s;
  }

  // ---------- Activity + notifications ----------

  const LABELS = {
    title: 'title', status: 'status', priority: 'priority', due: 'due date', start: 'start date',
    assignees: 'assignees', labels: 'labels', description: 'description', name: 'name',
    qty: 'quantity', unitCost: 'unit cost', amount: 'amount', end: 'end date', firmware: 'firmware',
  };
  const TRACKED = new Set(['tasks', 'projects', 'purchases', 'punch', 'invoices', 'bom', 'cables', 'sow', 'layouts', 'gear']);
  const NOUN = {
    tasks: 'task', projects: 'project', purchases: 'purchase order', punch: 'punch item', invoices: 'invoice',
    bom: 'BOM line', cables: 'cable', sow: 'scope of work', layouts: 'room layout', gear: 'gear item',
  };

  function docName(d) {
    return d.title || d.name || d.label || d.poNumber || d.number || d.item || d.description || d.id;
  }

  function describeChanges(before, after) {
    const out = [];
    for (const k of Object.keys(LABELS)) {
      const a = before ? before[k] : undefined;
      const b = after[k];
      if (JSON.stringify(a ?? null) === JSON.stringify(b ?? null)) continue;
      if (k === 'description') { out.push('edited the description'); continue; }
      if (Array.isArray(b) || Array.isArray(a)) { out.push(`updated ${LABELS[k]}`); continue; }
      out.push(`changed ${LABELS[k]} ${a ? `from “${a}” ` : ''}to “${b ?? '—'}”`);
    }
    if (JSON.stringify(before?.attachments || []) !== JSON.stringify(after.attachments || []) && (after.attachments || []).length > (before?.attachments || []).length) out.push('added an attachment');
    return out;
  }

  function parseMentions(text, users) {
    const found = new Set();
    const re = /@([a-zA-Z0-9._-]+)/g;
    let m;
    while ((m = re.exec(text || ''))) {
      const u = users.find((x) => x.username.toLowerCase() === m[1].toLowerCase());
      if (u) found.add(u.id);
    }
    return [...found];
  }

  function linkFor(coll, doc) {
    if (coll === 'tasks') return `/projects/${doc.projectId}/tasks/${doc.id}`;
    if (coll === 'projects') return `/projects/${doc.id}`;
    if (doc.projectId) return `/projects/${doc.projectId}`;
    return '/';
  }

  /**
   * Runs after any write. `engine` is implemented by the server and the in-browser demo:
   *   engine.get(coll,id) engine.put(coll,doc) engine.users() engine.notify(userId,{title,body,link})
   *   engine.channel({title,body,link}) engine.now()
   */
  async function afterWrite(engine, coll, before, after, actor) {
    if (!after) return;
    const users = await engine.users();
    const actorName = actor?.name || 'API';

    if (TRACKED.has(coll)) {
      const changes = before ? describeChanges(before, after) : [`created this ${NOUN[coll]}`];
      if (changes.length) {
        await engine.put('activity', {
          id: uid('act'), target: `${coll}:${after.id}`, projectId: after.projectId || (coll === 'projects' ? after.id : null),
          actorId: actor?.id || null, actorName, text: changes.join(', '), noun: NOUN[coll], name: docName(after), at: engine.now(),
        });
      }
    }

    if (coll === 'tasks') {
      const prev = new Set(before?.assignees || []);
      for (const uidv of after.assignees || []) {
        if (prev.has(uidv) || uidv === actor?.id) continue;
        await engine.notify(uidv, { title: 'New assignment', body: `${actorName} assigned you “${after.title}”${after.due ? ` (due ${after.due})` : ''}`, link: linkFor('tasks', after) });
      }
      if (!before) await engine.channel({ title: 'Task created', body: `${actorName} created “${after.title}”`, link: linkFor('tasks', after), event: 'task.created' });
      if (before && before.status !== 'Done' && after.status === 'Done') {
        await engine.channel({ title: 'Task completed', body: `${actorName} completed “${after.title}”`, link: linkFor('tasks', after), event: 'task.completed' });
      }
    }

    if (coll === 'comments' && !before) {
      const target = after.target || '';
      const [tColl, tId] = target.split(':');
      const tDoc = tColl && tId ? await engine.get(tColl, tId) : null;
      const where = tDoc ? `“${docName(tDoc)}”` : 'a thread';
      const link = tDoc ? linkFor(tColl, tDoc) : '/';
      const notified = new Set([actor?.id]);
      for (const id of parseMentions(after.body, users)) {
        if (notified.has(id)) continue;
        notified.add(id);
        await engine.notify(id, { title: `${actorName} mentioned you`, body: `On ${where}: ${String(after.body).slice(0, 180)}`, link });
      }
      for (const id of tDoc?.assignees || []) {
        if (notified.has(id)) continue;
        notified.add(id);
        await engine.notify(id, { title: 'New comment', body: `${actorName} on ${where}: ${String(after.body).slice(0, 180)}`, link });
      }
      if (TRACKED.has(tColl)) {
        await engine.put('activity', { id: uid('act'), target, projectId: tDoc?.projectId || null, actorId: actor?.id || null, actorName, text: 'commented', noun: NOUN[tColl], name: tDoc ? docName(tDoc) : '', at: engine.now() });
      }
      await engine.channel({ title: 'New comment', body: `${actorName} on ${where}: ${String(after.body).slice(0, 180)}`, link, event: 'comment.created' });
    }

    if (coll === 'purchases' && before && before.status !== after.status) {
      await engine.channel({ title: 'Purchase order updated', body: `${after.poNumber || 'PO'} (${after.vendor || ''}) is now ${after.status}`, link: linkFor('purchases', after), event: 'purchase.status' });
    }
  }

  /** Finds tasks due soon or overdue and notifies assignees once. Returns the tasks it touched. */
  async function dueReminders(engine, tasks, hoursAhead) {
    const now = new Date(engine.now());
    const touched = [];
    for (const t of tasks) {
      if (!t.due || t.status === 'Done' || !(t.assignees || []).length) continue;
      const due = new Date(t.due + 'T17:00:00');
      const hrs = (due - now) / 36e5;
      let kind = null;
      if (hrs < 0 && !t.overdueNotified) kind = 'overdue';
      else if (hrs >= 0 && hrs <= hoursAhead && !t.reminderSent) kind = 'soon';
      if (!kind) continue;
      for (const u of t.assignees) {
        await engine.notify(u, {
          title: kind === 'overdue' ? 'Task overdue' : 'Task due soon',
          body: `“${t.title}” ${kind === 'overdue' ? 'was due' : 'is due'} ${t.due}`,
          link: linkFor('tasks', t),
        });
      }
      const next = { ...t };
      if (kind === 'overdue') next.overdueNotified = true; else next.reminderSent = true;
      await engine.put('tasks', next);
      touched.push(next);
    }
    return touched;
  }

  // ---------- Calendar feed ----------
  function icsEscape(s) { return String(s || '').replace(/[\\;,]/g, (m) => '\\' + m).replace(/\n/g, '\\n'); }
  function icsDate(d) { return String(d).replace(/-/g, ''); }
  function addDay(d) { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); }

  function buildICS({ tasks = [], projects = [], access = [], orgName = 'HCC Production', appUrl = '' }) {
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//HCC Production//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${icsEscape(orgName)}`];
    const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
    const ev = (id, start, end, summary, desc, url) => {
      lines.push('BEGIN:VEVENT', `UID:${id}@hcc-production`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${icsDate(start)}`, `DTEND;VALUE=DATE:${icsDate(addDay(end || start))}`, `SUMMARY:${icsEscape(summary)}`);
      if (desc) lines.push(`DESCRIPTION:${icsEscape(desc)}`);
      if (url) lines.push(`URL:${url}`);
      lines.push('END:VEVENT');
    };
    for (const t of tasks) if (t.due && t.status !== 'Done') ev('task-' + t.id, t.due, t.due, `Due: ${t.title}`, `${t.priority || ''} · ${t.status || ''}`, appUrl ? `${appUrl}/#${linkFor('tasks', t)}` : '');
    for (const p of projects) if (p.start) ev('proj-' + p.id, p.start, p.end || p.start, `Project: ${p.name}`, p.summary, '');
    for (const a of access) if (a.from) ev('access-' + a.id, a.from, a.to || a.from, `Site access: ${a.who || 'Contractor'}`, `Areas: ${a.areas || ''}`, '');
    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }

  // ---------- Demo seed data ----------
  function seed(adminId) {
    const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
    const iso = (n, h = 10) => { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(h, 0, 0, 0); return d.toISOString(); };
    const P = 'proj_sanctuary', P2 = 'proj_youth';

    const teamRoles = [
      { id: 'role_td', name: 'Technical Director', color: '#d4d4d4', description: 'Owns the production systems, schedules volunteers and signs off on changes.' },
      { id: 'role_a1', name: 'Audio Engineer (A1)', color: '#a3a3a3', description: 'Runs FOH mix on the console, line checks, and the broadcast mix.' },
      { id: 'role_video', name: 'Video Director', color: '#8a8a8a', description: 'Calls cameras and switches the livestream.' },
      { id: 'role_cam', name: 'Camera Operator', color: '#c4c4c4', description: 'Runs a manned camera position or the PTZ joystick.' },
      { id: 'role_pp', name: 'ProPresenter / Lyrics', color: '#b8b8b8', description: 'Runs slides, lyrics, lower thirds and announcements.' },
      { id: 'role_ltg', name: 'Lighting', color: '#9a9a9a', description: 'Runs the lighting console and pre-service looks.' },
      { id: 'role_stream', name: 'Stream Tech', color: '#737373', description: 'Monitors the encoder, chat and stream health.' },
    ];

    const people = [
      { id: 'per_edwin', name: 'Edwin Schuster', roles: ['role_td', 'role_a1'], email: 'ewschuster03@gmail.com', phone: '', status: 'On Site', statusNote: 'In the booth for Sunday prep', lastCheckIn: iso(0, 8), userId: adminId },
      { id: 'per_maria', name: 'Maria Lopez', roles: ['role_a1'], email: 'maria@example.org', phone: '(555) 201-4410', status: 'Serving Sunday', statusNote: 'FOH 9am + 11am', lastCheckIn: iso(-1, 19), userId: 'usr_maria' },
      { id: 'per_james', name: 'James Carter', roles: ['role_video', 'role_cam'], email: 'james@example.org', phone: '(555) 201-7731', status: 'Available', statusNote: '', lastCheckIn: iso(-3, 12), userId: 'usr_james' },
      { id: 'per_sarah', name: 'Sarah Kim', roles: ['role_pp', 'role_stream'], email: 'sarah@example.org', phone: '(555) 201-0092', status: 'Away', statusNote: 'Out of town until next week', lastCheckIn: iso(-9, 9), userId: null },
      { id: 'per_dave', name: 'Dave Morris', roles: ['role_ltg'], email: 'dave@example.org', phone: '(555) 201-5567', status: 'Available', statusNote: '', lastCheckIn: iso(-16, 18), userId: null },
    ];

    const sops = [
      {
        id: 'sop_welcome', group: 'Getting Started', order: 1, icon: '◆', public: true, title: 'Welcome to HCC Production',
        description: 'How the production team works, and where to find things.',
        body: `Welcome to the Hope Christian Church production team. This handbook holds every standard operating procedure we use to run services, events and maintenance.

:::note Who this is for
Every volunteer and staff member on the production team. Anything marked **public** can also be read by the wider church staff.
:::

## How the handbook is organized

| Section | What lives there |
| --- | --- |
| Getting Started | Team expectations, call times, contacts |
| Sunday Service | Step-by-step startup, run-of-show and shutdown |
| Audio / Video | Console, camera, stream and ProPresenter procedures |
| Maintenance | Firmware, backups, cable testing |

## Call times

- **Tech team:** 7:15 AM for the 9:00 AM service
- **Band line check:** 7:45 AM
- **Stream goes live:** 8:55 AM

:::tip Bookmark this page
On your phone, use **Add to Home Screen** so the handbook opens like an app on Sunday morning.
:::`,
      },
      {
        id: 'sop_startup', group: 'Sunday Service', order: 1, icon: '▶', public: true, title: 'Sunday System Startup',
        description: 'Power-up order for the sanctuary systems before the first service.',
        body: `Follow this order every Sunday. Powering amplifiers before the console sends a thump through the PA that can damage drivers.

:::warning Power order matters
Amplifiers are **always last on, first off**.
:::

:::steps
### Unlock the booth and turn on the UPS
Check the UPS front panel shows **Online** and battery at 100%.

### Power the stage racks
Turn on the stage box sequencer (Rack A) and wait for all I/O lights to go solid.

### Start the audio console
Power the console and load the show file \`Sunday_Main_v12\`. Confirm the sample rate reads **48 kHz**.

### Start the video system
Turn on the switcher, the PTZ cameras and the ProPresenter machine. Recall camera preset 1 on every PTZ.

### Turn on the amplifiers
Press the sequencer button for **Amps**. Wait for the green **Ready** light on each amp.

### Line check
Walk every input with the band. Mark any failure on the patch sheet and create a task in the app.
:::

## Reference

![Booth rack overview](data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="260" viewBox="0 0 640 260"><rect width="640" height="260" fill="#1c1c1c"/><g font-family="monospace" font-size="14" fill="#e5e5e5"><rect x="40" y="30" width="160" height="200" rx="6" fill="#262626" stroke="#d4d4d4" stroke-width="2"/><text x="60" y="60">RACK A</text><text x="60" y="90">UPS</text><text x="60" y="115">Sequencer</text><text x="60" y="140">Stage box 1</text><text x="60" y="165">Stage box 2</text><rect x="240" y="30" width="160" height="200" rx="6" fill="#262626" stroke="#d4d4d4" stroke-width="2"/><text x="260" y="60">RACK B</text><text x="260" y="90">Switcher</text><text x="260" y="115">Router</text><text x="260" y="140">Encoder</text><rect x="440" y="30" width="160" height="200" rx="6" fill="#262626" stroke="#d4d4d4" stroke-width="2"/><text x="460" y="60">AMP RACK</text><text x="460" y="90">Amp 1 - Mains</text><text x="460" y="115">Amp 2 - Subs</text><text x="460" y="140">Amp 3 - Fills</text></g></svg>')})

:::accordion What if the console will not boot?
Hold the power button for 10 seconds, wait 30 seconds, then power on again. If it still fails, switch to the backup show file on the USB stick in the drawer and call the Technical Director.
:::`,
      },
      {
        id: 'sop_stream', group: 'Sunday Service', order: 2, icon: '●', public: true, title: 'Livestream Checklist',
        description: 'Everything to verify before the stream goes live at 8:55.',
        body: `Run this checklist 20 minutes before the service.

- [ ] Encoder shows a stable bitrate above 6,000 kbps
- [ ] Stream key matches this week's YouTube event
- [ ] Broadcast mix is on bus 15/16 and peaking around -12 dBFS
- [ ] Countdown video is loaded in ProPresenter
- [ ] Chat moderator is online

:::info Stream settings
\`\`\`
Resolution: 1920x1080
Frame rate: 29.97
Bitrate: 6000 kbps CBR
Keyframe: 2 s
Audio: AAC 48 kHz, 192 kbps
\`\`\`
:::

## Going live

:::steps
### Start the YouTube event
Open YouTube Studio and confirm the event shows **Receiving**.

### Roll the countdown
At 8:55 cue the countdown in ProPresenter on the stream output.

### Confirm audio on the stream
Listen on the confidence monitor with a 30-second delay. Do not trust the booth speakers for this.
:::

:::danger Never end the stream from the encoder first
End the event in YouTube Studio, then stop the encoder. Stopping the encoder first leaves a broken VOD.
:::`,
      },
      {
        id: 'sop_shutdown', group: 'Sunday Service', order: 3, icon: '■', public: true, title: 'End of Day Shutdown',
        description: 'Shutdown order and what to leave charging.',
        body: `:::steps
### Amplifiers off
Press the **Amps** sequencer button and wait for the amps to go dark.

### Save the console show file
Save as \`Sunday_Main_vXX\` with today's date in the comment field.

### Video and computers
Shut down ProPresenter and the stream PC from the operating system. Never pull power.

### Charge batteries
Every wireless mic pack goes back on the charger. Check the charging light.
:::

:::check Done
Lock the booth and check in with **Off duty** in the Roster.
:::`,
      },
      {
        id: 'sop_wireless', group: 'Audio', order: 1, icon: '♪', public: false, title: 'Wireless Mic Frequencies',
        description: 'Coordinated frequencies and pack assignments.',
        body: `Frequencies are coordinated for the sanctuary. Do not change them without updating this page.

| Pack | Name | Frequency (MHz) | Group/Ch |
| --- | --- | --- | --- |
| 1 | Pastor headset | 518.250 | 1/01 |
| 2 | Worship leader | 521.875 | 1/02 |
| 3 | Host handheld | 525.125 | 1/03 |
| 4 | Spare | 528.650 | 1/04 |

:::warning Battery rule
Fresh AA batteries every service for the pastor pack, even if the meter shows full.
:::`,
      },
      {
        id: 'sop_firmware', group: 'Maintenance', order: 1, icon: '⚙', public: false, title: 'Firmware Updates & Config Backups',
        description: 'How to update firmware without breaking Sunday.',
        body: `Firmware updates happen **Tuesday through Thursday only**. Never update the week of a special service.

:::steps
### Back up the current config
Export the device config and upload it to the device page under **Gear → Config backups**.

### Record the firmware version
Update the **Firmware** field on the gear item before and after.

### Update and test
Apply the update, then run a full signal test. Note results in a task comment.
:::

:::tip Labeling
Every device gets a label with its asset tag, IP address and firmware version. Print new labels after each update.
:::`,
      },
    ];

    const projects = [
      { id: P, name: 'Sanctuary AV Refresh', status: 'Active', start: day(-30), end: day(60), color: '#d4d4d4', summary: 'Replace the main PA, add two PTZ cameras and re-cable the booth to the stage.', budget: 85000, lead: adminId, description: 'Phase 1 covers the booth-to-stage fiber trunk and stage boxes. Phase 2 covers the PA swap during the week of the 15th.' },
      { id: P2, name: 'Youth Room Install', status: 'Planning', start: day(14), end: day(75), color: '#8a8a8a', summary: 'New projector, small mixer and stream-ready camera for the youth room.', budget: 18000, lead: 'usr_james', description: '' },
    ];

    const T = (o) => ({ id: uid('tsk'), projectId: P, status: 'To Do', priority: 'Medium', assignees: [], labels: [], attachments: [], createdAt: iso(-20), ...o });
    const tFiber = T({ id: 'tsk_fiber', title: 'Pull fiber trunk booth → stage', status: 'In Progress', priority: 'High', assignees: [adminId, 'usr_james'], labels: ['Cabling'], start: day(-6), due: day(2), description: '12-strand single-mode from Rack B to the stage left closet. Use the existing 2" conduit along the east wall.' });
    const tasks = [
      tFiber,
      T({ title: 'Terminate and test fiber ends', parentId: 'tsk_fiber', status: 'To Do', assignees: [adminId], due: day(4), labels: ['Cabling'] }),
      T({ title: 'Label both ends with cable IDs', parentId: 'tsk_fiber', status: 'To Do', assignees: ['usr_james'], due: day(5), labels: ['Cabling'] }),
      T({ title: 'Order PTZ cameras', status: 'Done', priority: 'High', assignees: [adminId], labels: ['Video', 'Purchasing'], start: day(-25), due: day(-18) }),
      T({ title: 'Mount PTZ camera brackets', status: 'Blocked', priority: 'Medium', assignees: ['usr_james'], labels: ['Video'], start: day(1), due: day(6), description: 'Waiting on the contractor lift. See punch list.' }),
      T({ title: 'Update console firmware to 5.1', status: 'Review', priority: 'Low', assignees: ['usr_maria'], labels: ['Audio', 'Firmware'], due: day(1) }),
      T({ title: 'Speaker demo with vendor', status: 'To Do', priority: 'Urgent', assignees: [adminId, 'usr_maria'], labels: ['Audio'], start: day(8), due: day(8) }),
      T({ title: 'Remove old PA cluster', status: 'Backlog', priority: 'High', labels: ['Audio', 'Contractor'], start: day(20), due: day(24) }),
      T({ title: 'Hang and aim new line array', status: 'Backlog', priority: 'High', labels: ['Audio', 'Contractor'], start: day(24), due: day(30) }),
      T({ title: 'Tune new PA system', status: 'Backlog', priority: 'Medium', assignees: ['usr_maria'], labels: ['Audio'], start: day(31), due: day(33) }),
      T({ projectId: P2, title: 'Survey youth room power and data', status: 'To Do', priority: 'Medium', assignees: ['usr_james'], labels: ['Site Survey'], start: day(14), due: day(16) }),
    ];

    const comments = [
      { id: uid('cmt'), target: 'tasks:tsk_fiber', body: 'Conduit is clear. @james can you bring the fish tape Thursday?', authorId: adminId, authorName: 'Edwin Schuster', createdAt: iso(-2, 14) },
      { id: uid('cmt'), target: 'tasks:tsk_fiber', body: 'Will do. I can be there at 6pm.', authorId: 'usr_james', authorName: 'James Carter', createdAt: iso(-2, 16) },
    ];

    const cables = [
      { id: uid('cbl'), projectId: P, label: 'FO-001', type: 'Fiber SM', from: 'Booth Rack B', to: 'Stage Left Closet', lengthFt: 180, status: 'Pulled', room: 'Sanctuary', notes: '12 strand' },
      { id: uid('cbl'), projectId: P, label: 'NET-014', type: 'Cat6A', from: 'Booth Rack B', to: 'PTZ-2 (Balcony)', lengthFt: 95, status: 'Tested', room: 'Sanctuary', notes: 'PoE++' },
      { id: uid('cbl'), projectId: P, label: 'NET-015', type: 'Cat6A', from: 'Booth Rack B', to: 'PTZ-3 (House Right)', lengthFt: 120, status: 'Terminated', room: 'Sanctuary', notes: '' },
      { id: uid('cbl'), projectId: P, label: 'SDI-003', type: '12G-SDI', from: 'Stage Left Closet', to: 'Booth Switcher In 4', lengthFt: 160, status: 'Planned', room: 'Sanctuary', notes: '' },
      { id: uid('cbl'), projectId: P, label: 'SPK-001', type: 'Speaker 12/4', from: 'Amp Rack', to: 'Main Array L', lengthFt: 140, status: 'Planned', room: 'Sanctuary', notes: '' },
    ];

    const layouts = [{
      id: 'lay_sanc', projectId: P, name: 'Sanctuary – Main Floor', background: null, width: 1000, height: 640,
      items: [
        { id: 'z1', type: 'zone', label: 'STAGE', x: 300, y: 40, w: 400, h: 150 },
        { id: 'z2', type: 'zone', label: 'BOOTH', x: 420, y: 520, w: 160, h: 90 },
        { id: 'z3', type: 'zone', label: 'SL CLOSET', x: 160, y: 60, w: 110, h: 90 },
        { id: 'g1', type: 'speaker', label: 'Main L', x: 320, y: 210 },
        { id: 'g2', type: 'speaker', label: 'Main R', x: 680, y: 210 },
        { id: 'g3', type: 'camera', label: 'PTZ-2', x: 560, y: 420 },
        { id: 'g4', type: 'camera', label: 'PTZ-3', x: 860, y: 330 },
        { id: 'g5', type: 'rack', label: 'Rack B', x: 470, y: 565 },
        { id: 'g6', type: 'stagebox', label: 'Stage Box 1', x: 215, y: 105 },
        { id: 'g7', type: 'display', label: 'Confidence', x: 500, y: 250 },
      ],
      runs: [
        { id: 'r1', from: 'g5', to: 'g6', label: 'FO-001', color: '#e5e5e5' },
        { id: 'r2', from: 'g5', to: 'g3', label: 'NET-014', color: '#a3a3a3' },
        { id: 'r3', from: 'g5', to: 'g4', label: 'NET-015', color: '#a3a3a3' },
      ],
    }];

    const bom = [
      { id: uid('bom'), projectId: P, item: 'PTZ camera 4K NDI', partNumber: 'PTZ-4K-20X', vendor: 'B&H', category: 'Video', qty: 2, unitCost: 4295, status: 'Received' },
      { id: uid('bom'), projectId: P, item: 'Line array element', partNumber: 'LA-210', vendor: 'Full Compass', category: 'Audio', qty: 8, unitCost: 3150, status: 'Quoted' },
      { id: uid('bom'), projectId: P, item: 'Sub 18"', partNumber: 'SUB-18', vendor: 'Full Compass', category: 'Audio', qty: 2, unitCost: 2890, status: 'Quoted' },
      { id: uid('bom'), projectId: P, item: '12-strand SM fiber, plenum (ft)', partNumber: 'OS2-12-PL', vendor: 'Graybar', category: 'Cabling', qty: 250, unitCost: 2.4, status: 'Received' },
      { id: uid('bom'), projectId: P, item: 'Fiber stage box 32x16', partNumber: 'SB-3216', vendor: 'Sweetwater', category: 'Audio', qty: 1, unitCost: 6499, status: 'Ordered' },
      { id: uid('bom'), projectId: P, item: 'Cat6A shielded (1000ft box)', partNumber: 'C6A-SH-1K', vendor: 'Graybar', category: 'Cabling', qty: 1, unitCost: 489, status: 'Received' },
    ];

    const purchases = [
      { id: uid('po'), projectId: P, poNumber: 'PO-2026-031', vendor: 'B&H', date: day(-22), status: 'Received', category: 'Video', notes: '', lines: [{ desc: 'PTZ camera 4K NDI', qty: 2, unitCost: 4295, receivedQty: 2 }], receivedDate: day(-15), attachments: [] },
      { id: uid('po'), projectId: P, poNumber: 'PO-2026-034', vendor: 'Sweetwater', date: day(-10), status: 'Ordered', category: 'Audio', notes: 'ETA 2 weeks', lines: [{ desc: 'Fiber stage box 32x16', qty: 1, unitCost: 6499, receivedQty: 0 }], attachments: [] },
      { id: uid('po'), projectId: P, poNumber: 'PO-2026-035', vendor: 'Graybar', date: day(-9), status: 'Partially Received', category: 'Cabling', notes: '', lines: [{ desc: '12-strand SM fiber (ft)', qty: 250, unitCost: 2.4, receivedQty: 250 }, { desc: 'Cat6A shielded box', qty: 1, unitCost: 489, receivedQty: 1 }, { desc: 'LC connectors (24pk)', qty: 2, unitCost: 145, receivedQty: 0 }], attachments: [] },
    ];

    const contractors = [
      { id: 'con_spark', company: 'Bright Spark Electric', contact: 'Tom Reyes', trade: 'Electrical', phone: '(555) 300-1188', email: 'tom@brightspark.example', insuranceExpires: day(120), rate: '$95/hr', notes: 'Licensed, did the 2024 lighting circuits.' },
      { id: 'con_rig', company: 'Summit Rigging', contact: 'Alicia Grant', trade: 'Rigging / Install', phone: '(555) 300-4421', email: 'alicia@summitrig.example', insuranceExpires: day(20), rate: 'Fixed bid', notes: '' },
    ];
    const sow = [
      { id: uid('sow'), contractorId: 'con_rig', projectId: P, title: 'PA removal and line array hang', status: 'Signed', value: 12500, start: day(20), end: day(30), body: '## Scope\n- Remove existing center cluster and dispose\n- Install new rigging points per engineer drawing\n- Fly and aim 8-element array per prediction\n\n## Exclusions\n- Electrical work\n- Patching and repair of ceiling tiles' },
      { id: uid('sow'), contractorId: 'con_spark', projectId: P, title: 'Dedicated circuits for amp rack', status: 'Sent', value: 3400, start: day(10), end: day(12), body: '- Two 20A dedicated circuits to the amp rack\n- Isolated ground' },
    ];
    const access = [
      { id: uid('acc'), contractorId: 'con_rig', who: 'Summit Rigging crew (4)', from: day(20), to: day(30), hours: '7:00 AM – 5:00 PM', areas: 'Sanctuary, catwalk, loading dock', badge: 'Key #12, Badge T-4', approvedBy: 'Edwin Schuster', notes: 'No work on Sunday. Lift stays in the dock overnight.' },
      { id: uid('acc'), contractorId: 'con_spark', who: 'Tom Reyes', from: day(10), to: day(12), hours: '8:00 AM – 4:00 PM', areas: 'Booth, electrical room B', badge: 'Key #7', approvedBy: 'Edwin Schuster', notes: '' },
    ];
    const punch = [
      { id: uid('pun'), projectId: P, contractorId: 'con_rig', location: 'Balcony rail', description: 'Lift access needed for PTZ-2 bracket', status: 'Open', due: day(5), photos: [] },
      { id: uid('pun'), projectId: P, contractorId: 'con_spark', location: 'Booth', description: 'Cover plate missing on floor box FB-3', status: 'Ready for Review', due: day(2), photos: [] },
    ];
    const invoices = [
      { id: uid('inv'), contractorId: 'con_rig', projectId: P, number: 'SR-1182', date: day(-5), dueDate: day(25), amount: 6250, status: 'Approved', notes: '50% deposit', attachments: [] },
    ];

    const gear = [
      { id: uid('ger'), name: 'FOH Console', category: 'Audio', manufacturer: 'Allen & Heath', model: 'dLive S5000', serial: 'AH-S5K-204411', assetTag: 'HCC-A-001', location: 'Booth', status: 'In Service', firmware: '2.01', firmwareUpdated: day(-60), ip: '192.168.10.10', mac: '00:04:C4:12:34:56', purchaseDate: '2021-03-12', warranty: '2026-03-12', notes: '', configs: [], photos: [] },
      { id: uid('ger'), name: 'Stage Box 1', category: 'Audio', manufacturer: 'Allen & Heath', model: 'DX168', serial: 'AH-DX-55821', assetTag: 'HCC-A-014', location: 'Stage Left Closet', status: 'In Service', firmware: '2.01', firmwareUpdated: day(-60), ip: '', mac: '', notes: '', configs: [], photos: [] },
      { id: uid('ger'), name: 'PTZ-2 Balcony', category: 'Video', manufacturer: 'BirdDog', model: 'P400', serial: 'BD-P4-00921', assetTag: 'HCC-V-022', location: 'Balcony', status: 'Spare', firmware: '5.5.112', firmwareUpdated: day(-15), ip: '192.168.20.32', mac: '', notes: 'Awaiting mount', configs: [], photos: [] },
      { id: uid('ger'), name: 'Production Switcher', category: 'Video', manufacturer: 'Blackmagic', model: 'ATEM Constellation 4K', serial: 'BM-ATC-7731A', assetTag: 'HCC-V-001', location: 'Booth Rack B', status: 'In Service', firmware: '9.6', firmwareUpdated: day(-100), ip: '192.168.20.10', mac: '', notes: '', configs: [], photos: [] },
      { id: uid('ger'), name: 'Core Switch', category: 'Network', manufacturer: 'Netgear', model: 'M4250-26G4XF', serial: 'NG-M4250-1129', assetTag: 'HCC-N-001', location: 'Booth Rack B', status: 'In Service', firmware: '13.0.4.26', firmwareUpdated: day(-200), ip: '192.168.1.2', mac: '', notes: 'AV VLANs 10/20/30', configs: [], photos: [] },
    ];

    const photos = [];
    const notifications = [];
    const settings = [{ id: 'global', orgName: 'HCC Production', publicSops: true, sopGroups: ['Getting Started', 'Sunday Service', 'Audio', 'Video', 'Maintenance'], reminderHours: 24, ntfyServer: 'https://ntfy.sh', slackWebhook: '', teamsWebhook: '', appUrl: '', calendarToken: uid('cal') }];

    return { teamRoles, people, sops, projects, tasks, comments, cables, layouts, bom, purchases, contractors, sow, access, punch, invoices, gear, photos, notifications, settings, webhooks: [], activity: [] };
  }

  globalThis.HCC = { ROLE_RANK, ACCESS, ENUMS, can, redact, uid, describeChanges, parseMentions, afterWrite, dueReminders, buildICS, seed, linkFor, docName };
})();
