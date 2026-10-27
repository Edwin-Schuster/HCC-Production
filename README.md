# HCC Production

The production team app for Hope Christian Church. It covers SOPs, the team roster, project management, budgets, contractors and gear, and it is built mobile first for use on site.

It is a single Docker container with **no npm dependencies**. It uses Node 22, its built-in SQLite, and plain HTML/CSS/JS.

## Features

| Area | What you get |
| --- | --- |
| **SOPs** | A handbook in the style of Mintlify, with a sidebar of sections, an "On this page" table of contents, ⌘K search, previous/next links and print-to-PDF. The Markdown editor has a live preview and a toolbar for **steps**, **callouts** (note/tip/warning/danger/check), **accordions**, tables, code blocks and checklists. You can paste or drop **photos, GIFs and videos**, or embed YouTube/Vimeo. Each SOP is marked *public* or *team only*. |
| **Users & roles** | **Admin** can do everything, including users, integrations and API keys. **Editor** can edit all content. **Viewer** can read SOPs, the roster and project status, but not budgets, tasks or contractors. **Public** visitors who aren't signed in can read SOPs marked public. All of this is enforced on the server. |
| **Roster** | Production roles, people, a check-in status for each person ("On Site", "Serving Sunday"…), a note, and how long ago they last checked in. Old check-ins are highlighted. |
| **Projects** | Tasks in **List / Board / Calendar / Timeline** views. Tasks have subtasks, a description, assignees, start and due dates, priority, labels, file attachments with a file viewer, comments with **@mentions**, and a full **activity history**. |
| **Building cabling** | A cable schedule (ID, type, from/to, length, status) with a footage summary, printable cable labels and CSV export. |
| **Room layouts** | Upload a floor plan or draw zones, then drag AV gear onto it and draw cable runs linked to the cable schedule. Works with touch. |
| **Budgets & purchasing** | Bill of materials, purchase orders with line items, **receiving** (partial or full, which also updates the BOM), and budget tracking (planned / committed / spent / remaining) by category. |
| **Contractors** | Directory with insurance-expiry warnings, scope of work (Markdown), site-access windows (keys, areas, hours), punch lists with photos, and invoices. |
| **Gear** | Inventory with serial numbers, asset tags, IP/MAC addresses, a **firmware label** (printable) with update history, **config backup** upload and a text viewer that has line numbers and a filter. |
| **On site** | Mobile layout with bottom tabs, "Take photo" buttons that open the phone camera, photo documentation for each project, CSV export on every table, and a printable project report (Save as PDF). You can install it to your home screen as an app. |
| **Notifications** | In-app bell plus **push to your phone with [ntfy](https://ntfy.sh)** (free iOS/Android app) for mentions, new assignments, and reminders before tasks are due or once they're overdue. |
| **Integrations** | A **calendar feed** (`.ics`) for Google, Apple or Outlook calendars; **Slack** and **Teams** channel posts; **outgoing webhooks** with HMAC signatures; a **REST API** with API keys; and **file storage links** to Google Drive, Dropbox, OneDrive or Box next to uploaded files. |

## Try it without a server

`npm run build:demo` writes `dist/hcc-production-demo.html`. This is the whole app in one file, in **demo mode**: data is saved in your browser, and you can switch between demo accounts to see each role.

## Deploy on your VPS with Docker

```bash
git clone https://github.com/edwin-schuster/hcc-production.git
cd hcc-production
cp .env.example .env        # set ADMIN_PASSWORD, APP_URL, etc.
docker compose up -d --build
docker compose logs -f      # shows the generated admin password if you didn't set one
```

The app then runs at `http://your-server:8080`. Put it behind HTTPS before the team uses it. Two common options:

- **Caddy**: `production.example.org { reverse_proxy localhost:8080 }`
- **Nginx Proxy Manager / Traefik**: proxy to port 8080. Turn off response buffering for `/api/events` so live updates stream.

Once it is on HTTPS, set `COOKIE_SECURE=true` in `.env` and restart.

### First steps after deploying

1. Sign in as the admin and change your password under **Profile**.
2. **Settings → General**: set the organization name and the app address.
3. **Settings → Users & roles**: add your teammates and link each one to a roster entry, so they can check in.
4. Each person: **Profile → Notifications on your phone**. Install ntfy, press **Generate**, subscribe to that topic in the ntfy app, then press **Send test**.
5. Optional: **Settings → Notifications & calendar** for Slack or Teams webhooks and the calendar feed link.
6. Sample data is loaded the first time the app starts. Delete it once you've had a look, or set `SEED_DEMO=false` before the first start.

### Backups

Everything lives in the `hcc-data` volume (`/data/hcc.db` plus `/data/uploads/`).

```bash
docker run --rm -v hcc-production_hcc-data:/data -v "$PWD":/backup alpine tar czf /backup/hcc-backup-$(date +%F).tgz -C /data .
```

### Updating

```bash
git pull && docker compose up -d --build
```

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `ADMIN_USER` / `ADMIN_PASSWORD` / `ADMIN_NAME` / `ADMIN_EMAIL` | `admin` / random | The first admin, created only when the database is empty |
| `APP_URL` | — | Public URL, used for links in push notifications and calendar events |
| `SEED_DEMO` | `true` | Load the sample data on first start |
| `COOKIE_SECURE` | `false` | Send the session cookie over HTTPS only |
| `MAX_UPLOAD_MB` | `500` | Largest upload |
| `PORT` / `DATA_DIR` | `8080` / `/data` | Server port and storage folder |

## API

Create a key under **Settings → Webhooks & API** and send it as `Authorization: Bearer hcc_…`.

```
GET    /api/c/:collection          list    (tasks, projects, sops, people, gear, bom, purchases, cables, punch, invoices, …)
GET    /api/c/:collection/:id      read one
PUT    /api/c/:collection/:id      create or replace
DELETE /api/c/:collection/:id      delete
POST   /api/files?name=file.png    upload (raw body) → { id }
POST   /api/checkin                { status, note, personId }
GET    /calendar.ics?token=…       calendar feed (&project=ID for one project)
```

Outgoing webhooks POST JSON like `{ event: "tasks.updated", data, actor }` and include an `X-HCC-Signature: sha256=…` HMAC header. They fire on create, update and delete in every collection, plus `people.checkin` and `notification.created`.

## Development

```bash
npm run dev        # http://localhost:8080, data in ./data
npm test           # server smoke test (auth, roles, notifications, files, calendar)
npm run build:demo # single-file demo build
```

Code layout:

- `server/server.js`: HTTP server, auth, SQLite, uploads, live updates (SSE), reminders, integrations
- `public/shared.js`: roles and permissions, activity and notification rules, calendar feed, sample data. The server and the browser both use this file.
- `public/js/`: the single-page app (`core` = data, markdown and UI helpers; `views-*` = screens; `main` = routes and actions)
- `public/app.css`: design tokens and styles (Linear-style dark system: void/carbon surfaces, hairline borders, acid-lime primary action; Avenir Next LT Pro with Inter fallback, JetBrains Mono for IDs)
- `public/brand/`: Hope Christian Church logo, mark and app icons
- `public/fonts/`: drop your licensed Avenir Next LT Pro files here (see the README in that folder)
