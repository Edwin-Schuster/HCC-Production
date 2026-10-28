# HCC Production

The production team app for Hope Christian Church: SOPs, the roster, projects, cabling and room layouts, budgets and purchasing, contractors and gear. Built mobile first for use on site.

- **[`web/`](web/README.md)** — the app (Next.js, Postgres). Start here: features, development, deployment, configuration and tests.
- **[`extension/`](extension/README.md)** — a Chrome/Edge extension that shows the SOPs for the page you're on and records new ones.
- **[`legacy/`](legacy/README.md)** — the original single-file app, archived. Its data imports into the new app with one command.

## Run it

```bash
cp .env.example .env      # set POSTGRES_PASSWORD and ADMIN_PASSWORD at least
docker compose up -d --build
```

The app runs on port 3000 behind your HTTPS reverse proxy. Moving from the original app (port 8080)? Follow [Moving from the original app](web/README.md#moving-from-the-original-app): set `SEED_DEMO=false`, start the new app, then run

```bash
docker compose exec web node scripts/import-legacy.mjs /legacy
```
