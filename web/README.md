# HCC Production (Next.js)

The new HCC Production app. It starts with the SOP system and the existing HCC sign-in; the other modules (projects, roster, gear, contractors, purchasing, settings) are still served by the original app in the repository root until they're ported.

**Stack:** Next.js 16 (App Router), React 19, TypeScript (strict), Drizzle ORM on Postgres, BlockNote editor, Tailwind CSS 4, Zod, Playwright (PDF export and e2e tests), Vitest.

## Quick start (development)

Needs Node 22+.

```bash
cd web
npm install
ADMIN_USER=admin ADMIN_PASSWORD=change-me npm run dev
```

Open http://localhost:3000 and sign in. With no `DATABASE_URL`, the app uses an embedded Postgres (PGlite) in `web/.data/`, so you don't need a database server to develop. On first start it creates the admin account and, unless `SEED_DEMO=false`, demo folders and four SOPs. Delete `web/.data/` to start over.

PDF export needs Chromium: `npx playwright install chromium` once.

## Deploy with Docker

```bash
cd web
cp .env.example .env      # set POSTGRES_PASSWORD and ADMIN_PASSWORD at least
docker compose up -d --build
```

This runs Postgres and the app on port 3000. Put a reverse proxy with HTTPS in front (Caddy, Nginx Proxy Manager, Traefik) and keep `COOKIE_SECURE=true`. Back up both volumes: `hcc-pg` (database) and `hcc-files` (uploaded images).

The image is built on Microsoft's Playwright image, so Chromium is ready for PDF export. Keep its tag (`v1.63.0`) in step with the `playwright` version in `package.json`.

Database migrations run automatically when the app starts.

### Bring over users from the old app

Everyone keeps their username, password and role (`admin`, `editor` or `viewer`). Copy the old app's database (`hcc.db` in its data volume) into the new container and run the import. Usernames that already exist are skipped, so it's safe to re-run.

```bash
docker compose cp /path/to/hcc.db web:/data/legacy.db
docker compose exec web node scripts/import-legacy-users.mjs /data/legacy.db
```

Outside Docker: `npm run import:legacy-users -- /path/to/hcc.db`.

## Environment variables

| Variable | Default | What it does |
| --- | --- | --- |
| `DATABASE_URL` | `pglite://./.data/pglite` | `postgres://user:pass@host:5432/db` for Postgres. `pglite://<dir>` or `pglite://memory` for embedded Postgres (development and tests). |
| `DATABASE_POOL_MAX` | `10` | Postgres connection pool size. |
| `ADMIN_USER`, `ADMIN_PASSWORD`, `ADMIN_NAME`, `ADMIN_EMAIL` | `admin`, random, `Administrator`, none | The first admin, created only when there are no users. Without `ADMIN_PASSWORD`, a random one is printed to the logs. |
| `SEED_DEMO` | `true` | Demo folders, people and SOPs on an empty database. Set `false` for production. |
| `ORG_NAME` | `Hope Christian Church` | Workspace name on first start. |
| `COOKIE_SECURE` | `false` | Set `true` when served over HTTPS. |
| `DATA_DIR` | `./.data` | Where uploads (and embedded Postgres, if used) live. `/data` in Docker. |
| `UPLOAD_DIR` | `$DATA_DIR/uploads` | Override the upload folder only. |
| `MAX_UPLOAD_MB` | `25` | Largest image upload. |
| `INTERNAL_URL` | `http://127.0.0.1:$PORT` | Address the PDF renderer uses to load the print page. Only change it if the app can't reach itself on localhost. |
| `CHROMIUM_PATH` | Playwright's Chromium | Use a different Chromium for PDF export. |
| `MIGRATIONS_DIR` | `./drizzle` | Set in the Docker image. |
| `NEXT_PUBLIC_APP_TIMEZONE` | server time zone | Time zone for dates rendered on the server and in PDFs, such as `America/Chicago`. Applied at build time. |

## Tests

```bash
npm test              # unit and service tests (Vitest, in-memory Postgres)
npm run test:e2e      # browser tests (Playwright); starts its own dev server on port 3200
npm run typecheck
npm run lint
```

- Unit tests cover step numbering and renumbering, the editor's data conversion, permissions, and publishing (immutable versions, enforced by both the service layer and database triggers).
- The e2e tests sign in, write and publish an SOP with nested steps, check autosave survives a reload, and cover search, version history, PDF export and signed-out access.

## Project layout

```
web/
  drizzle/              SQL migrations (0001 adds the immutability triggers)
  scripts/              one-off scripts (legacy user import)
  src/
    app/                routes: (app) signed-in pages, (auth) sign-in, print/ PDF page, api/ route handlers
    blocks/             block schema (Zod), numbering and tree helpers, the shared renderer
    editor/             BlockNote editor, custom step and callout blocks, conversion to stored blocks
    server/             auth, permissions, services (SOPs, folders, search, audit, files), PDF, seed
    components/         UI primitives and app shell
  tests/unit, tests/e2e
```

How SOPs are stored:

- Each SOP has versions. Published versions are read-only, and the only editable version is a single draft.
- Content is stored as structured blocks, not HTML. A block's `key` stays the same from one version to the next, which is what future diffs and feedback will hang on.
- Every change to a published SOP is written to `audit_events`.

## Fonts

The UI uses Avenir Next LT Pro when it's installed on the viewer's machine or when the font files are placed in `public/fonts/` (`AvenirNextLTPro-Regular.woff2`, `AvenirNextLTPro-Bold.woff2`). Avenir is a licensed font, so the files aren't in the repository. Without them the app uses Inter.
