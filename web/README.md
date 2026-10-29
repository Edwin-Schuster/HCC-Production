# HCC Production

The production team app for Hope Christian Church: SOPs, the roster, projects, cabling and room layouts, budgets and purchasing, contractors and gear. It's built mobile first for use on site. It replaces the original app, which is archived in [`../legacy`](../legacy/README.md); everything in it can be imported (see below).

**Stack:** Next.js 16 (App Router), React 19, TypeScript (strict), Drizzle ORM on Postgres, BlockNote editor, Tailwind CSS 4, Zod, Playwright (PDF export and e2e tests), Vitest.

## What it does

- **Write:** a block editor with numbered steps (3.2.1), roles, times, expected results, warnings and branch rules ("if X, go to step N"); callouts, checklists, code, tables, images, video and embeds; shared **snippets**; five templates; autosave with local recovery.
- **Import** from Word, Google Docs, HTML or Markdown with a preview. **Annotate screenshots** with arrows, boxes, numbered markers and text; passwords and account numbers are found by OCR and blurred automatically.
- **Read:** a clean reading view with a table of contents, PDF export with page numbers and watermarks, a generated **flowchart**, full-text search that finds the matching step, and workspace **branding** (logo, colour, font, header and footer).
- **Govern:** immutable versions with change summaries, **visual diffs** between versions, rollback, optional **approvals** per folder, review dates with reminders and overdue badges, and an audit log of every change to a published SOP.
- **Use and improve:** **runs** (work through an SOP as a checklist with times and notes), step **feedback** ("unclear" / "wrong") routed to the owner, threaded **comments** with @mentions, and **suggested edits** the owner accepts into the draft. An inbox collects all of it.
- **Train:** assign SOPs to people with due dates; optional multiple-choice **quizzes** graded on the server; the version each person trained on is recorded.
- **Measure:** **analytics** for reads, most-skipped steps, run times against estimates, and feedback; a plain-language **audit log**.
- **Share and connect:** **share links** (optional password and expiry) for people outside the team; a **REST API** with personal API keys; signed **webhooks**; an **embed** script for other websites; and a **browser extension** (in [`../extension`](../extension/README.md)) that shows the SOPs for the page you're on and records clicks into a new SOP with screenshots.

Production modules:

- **Home:** your tasks by due date, the team and their roles, contractor insurance warnings, active projects, recent activity.
- **Roster:** people and the production roles they fill. Everyone can change their own name and email on their Profile; admins can rename anyone under People & roles.
- **Tasks:** your assigned project tasks in one list, plus **general tasks** that don't belong to any project.
- **Projects:** tasks in **list, board, calendar and timeline** views, with subtasks, assignees, labels, dates, files, comments with @mentions and a readable history. Due-date reminders, a subscribable **calendar feed**, CSV export and a printable **project report**.
- **Cabling and room layouts:** a cable schedule with footage by type and printable labels for both ends; floor plans with zones, devices linked to gear and cable runs linked to the schedule. Works with touch.
- **Budgets** (purchasing): bill of materials, purchase orders with lines and attachments, receiving (which updates the BOM), and planned / committed / spent / remaining by category.
- **Contractors:** directory with insurance-expiry warnings and documents, scopes of work in Markdown, site access (also in the calendar feed), punch lists with photos, and invoices.
- **Gear:** inventory with serials, asset tags and addresses, a printable firmware label with update history, and config backups with a viewer that has line numbers and a filter.
- **On site:** bottom tabs on phones, camera buttons, project photos by location, and install-to-home-screen. Notifications also go to phones through [ntfy](https://ntfy.sh): each person sets a topic on their Profile.

## Quick start (development)

Needs Node 22+.

```bash
cd web
npm install
ADMIN_USER=admin ADMIN_PASSWORD=change-me npm run dev
```

Open http://localhost:3000 and sign in. The development server also accepts `127.0.0.1`, `*.local` names (like `Your-Mac.local`) and this computer's own network addresses, so a phone on the same Wi-Fi works too. For any other address, list it in `DEV_ORIGINS` (comma-separated); otherwise the page loads but no buttons respond, because the dev server refuses to send its scripts to unknown addresses. The production build (`npm run build && npm start`, or Docker) has no such limit. With no `DATABASE_URL`, the app uses an embedded Postgres (PGlite) in `web/.data/`, so you don't need a database server to develop. On first start it creates the admin account and, unless `SEED_DEMO=false`, demo content: SOPs, the roster, two projects with tasks, cabling, purchasing, contractors and gear. Delete `web/.data/` to start over.

PDF export needs Chromium: `npx playwright install chromium` once.

## Deploy with Docker

From the repository root:

```bash
cp .env.example .env      # set POSTGRES_PASSWORD and ADMIN_PASSWORD at least
docker compose up -d --build
```

This runs Postgres and the app on port 3000. Put a reverse proxy with HTTPS in front (Caddy, Nginx Proxy Manager, Traefik) and keep `COOKIE_SECURE=true`. Back up both volumes: `hcc-pg` (database) and `hcc-files` (uploaded files).

The image is built on Microsoft's Playwright image, so Chromium is ready for PDF export. Keep its tag (`v1.63.0`) in step with the `playwright` version in `package.json`.

Database migrations run automatically when the app starts.

### Moving from the original app

The import brings across everything: users (with their usernames, passwords and roles), the roster, SOPs (the old Markdown steps, callouts and accordions become blocks), projects, tasks with comments and history, cabling, room layouts, purchasing, contractors, gear, photos and every uploaded file. Re-running it only adds what's new.

1. Stop the old app (`docker compose down` in its folder). Its data stays in the `hcc-data` volume.
2. In `.env`, set `SEED_DEMO=false` so the new app starts empty, and set `ADMIN_*` to the old admin's username (or leave the defaults: the old accounts come across anyway).
3. `docker compose up -d --build` from the repository root. The compose file mounts the old `hcc-data` volume read-only at `/legacy`.
4. Run the import and read its notes (missing files, webhooks to recreate):

   ```bash
   docker compose exec web node scripts/import-legacy.mjs /legacy
   ```

5. Point your reverse proxy at port 3000 instead of 8080, and sign in with your old password.
6. Things to redo by hand: webhooks (the event names changed) and Slack/Teams channel posts (not carried over; use webhooks). Everyone's phone alerts topic comes across.

Outside Docker: `npm run import:legacy -- /path/to/old/data` (the folder holding `hcc.db` and `uploads/`). Add `--users-only` to bring over accounts only. The import refuses to mix the old data into demo content unless you pass `--force`.

## Environment variables

| Variable | Default | What it does |
| --- | --- | --- |
| `DATABASE_URL` | `pglite://./.data/pglite` | `postgres://user:pass@host:5432/db` for Postgres. `pglite://<dir>` or `pglite://memory` for embedded Postgres (development and tests). |
| `DATABASE_POOL_MAX` | `10` | Postgres connection pool size. |
| `ADMIN_USER`, `ADMIN_PASSWORD`, `ADMIN_NAME`, `ADMIN_EMAIL` | `admin`, random, `Administrator`, none | The first admin, created only when there are no users. Without `ADMIN_PASSWORD`, a random one is printed to the logs. |
| `SEED_DEMO` | `true` | Demo folders, people and SOPs on an empty database. Only runs when the database has no SOPs or folders. |
| `ORG_NAME` | `Hope Christian Church` | Workspace name on first start. |
| `COOKIE_SECURE` | `false` | Set `true` when served over HTTPS. |
| `DATA_DIR` | `./.data` | Where uploads (and embedded Postgres, if used) live. `/data` in Docker. |
| `UPLOAD_DIR` | `$DATA_DIR/uploads` | Override the upload folder only. |
| `MAX_UPLOAD_MB` | `25` | Largest image or file upload. |
| `MAX_VIDEO_MB` | `250` | Largest video upload (MP4 or WebM). |
| `DISABLE_SCHEDULER` | `false` | Set `true` to stop the background jobs (review and task reminders, webhook delivery) in this process, for example when running several replicas and one of them runs them. |
| `APP_URL` | none | Public address, used in links in phone notifications and calendar events when an admin hasn't set one under Integrations. |
| `DISABLE_PUSH` | `false` | Set `true` to stop sending phone notifications through ntfy. |
| `INTERNAL_URL` | `http://127.0.0.1:$PORT` | Address the PDF renderer uses to load the print page. Only change it if the app can't reach itself on localhost. |
| `CHROMIUM_PATH` | Playwright's Chromium | Use a different Chromium for PDF export. |
| `DEV_ORIGINS` | none | Extra host names the development server will serve its scripts to, comma-separated, e.g. `hcc.lan,10.0.0.5`. Development only. |
| `MIGRATIONS_DIR` | `./drizzle` | Set in the Docker image. |
| `NEXT_PUBLIC_APP_TIMEZONE` | server time zone | Time zone for dates rendered on the server and in PDFs, such as `America/Chicago`. Applied at build time. |

## API, webhooks and embeds

Admins find the API reference, every API key, webhooks and the embed snippet under **Integrations** (user menu). People create their own API keys on their **Profile** page.

- Authenticate with `Authorization: Bearer hcc_…`. A key acts as its owner and never has more access than they do (a read-only key can't change anything).
- Webhook bodies are signed: `X-HCC-Signature: sha256=<HMAC-SHA256 of the raw body with the webhook's secret>`. Deliveries are retried for about 15 hours.
- Embeds: `<div data-hcc-sop="ID"></div><script src="https://your-host/embed.js" async></script>` for public SOPs, or `data-hcc-share="CODE"` for a share link.

## Tests

```bash
npm test              # unit and service tests (Vitest, in-memory Postgres)
npm run test:e2e      # browser tests (Playwright); starts its own dev server on port 3200
npm run typecheck
npm run lint
```

- Unit tests cover step numbering, the editor's data conversion, permissions, publishing (immutable versions, enforced by both the service layer and database triggers), approvals, snippets, review reminders, feedback, comments and suggestions, runs, diffs and rollback, import, branding, and the secret detection used for auto-blur; and for the production modules, the roster, projects and tasks (history, subtasks, board order, mentions, due-date reminders), the calendar feed, cabling and layouts, budget arithmetic and receiving, contractors, gear, private files, phone push, Markdown safety, CSV escaping and the import from the original app.
- The e2e tests cover writing and publishing with nested steps, autosave across a reload, the approval flow with two people, comments, suggestions and feedback, runs, import from Word, search, version history, PDF export and signed-out access; and the roster, projects and tasks in every view, cabling and layouts, purchasing and receiving, contractors, gear and config backups, the home page, photos and the project report.

## Project layout

```
web/
  drizzle/              SQL migrations (0001 adds the immutability triggers)
  scripts/              import from the original app; copies the OCR engine into public/vendor before dev and build
  src/
    app/                routes: (app) signed-in pages, (auth) sign-in, print/ PDF page, api/ route handlers
    blocks/             block schema (Zod), numbering and tree helpers, the shared renderer
    editor/             BlockNote editor, custom step and callout blocks, conversion to stored blocks
    server/             auth, permissions, services (SOPs and their workflow; roster, projects, tasks, cabling, purchasing, contractors, gear, photos, calendar, push…), import, PDF, scheduler, seed
    components/         UI primitives, app shell, and work/ (the production modules' UI)
  tests/unit, tests/e2e
```

How SOPs are stored:

- Each SOP has versions. Published versions are read-only, and the only editable version is a single draft.
- Content is stored as structured blocks, not HTML. A block's `key` stays the same from one version to the next, so diffs, comments and feedback follow a step across versions.
- Snippets are referenced, not copied: an SOP shows the snippet's latest version unless it's pinned. Saved snippet versions are immutable too.
- Every change to a published SOP is written to `audit_events`.

## Fonts

The UI uses Avenir Next LT Pro when it's installed on the viewer's machine or when the font files are placed in `public/fonts/` (`AvenirNextLTPro-Regular.woff2`, `AvenirNextLTPro-Bold.woff2`). Avenir is a licensed font, so the files aren't in the repository. Without them the app uses Inter.
