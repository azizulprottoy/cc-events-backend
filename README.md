# MarcoPolo Backend (eventbackend)

Multi-tenant behavioral analytics/engagement platform. Super admin registers startups, each gets an API key, integrates via a public REST ingestion API, and gets a dashboard with charts, notifications, and recommendations for their end-users. Full design in `.claude/plans` (see `generic-soaring-map.md` in this session) — summary below.

## Setup

```bash
cp .env.example .env   # fill in MONGO_URI, JWT_SECRET, SUPERADMIN_EMAIL/PASSWORD at minimum
npm install
npm run seed:superadmin   # creates the first super admin login
npm run dev
```

Server starts on `PORT` (default 4000). API docs at `GET /api-docs`. Integration guide: `INTEGRATION.md`.

## Auth model

- **Super admin** — `POST /admin/auth/login` → JWT. Manages startups (`/admin/startups`).
- **Startup user** — `POST /auth/login` → JWT scoped to their startup. Reads the dashboard (`/dashboard`, `/notifications`, `/recommendations`).
- **Ingestion API** — `X-API-Key` + `X-API-Secret` headers, issued at startup registration. No JWT.

## Layout

```
src/
  config/     env + mongo connection
  models/     mongoose schemas
  middleware/ auth guards, api key auth, rate limiting, error handler
  routes/     admin, auth, ingest (public), dashboard, notifications, recommendations
  services/   business logic (event ingestion, aggregation, dashboard queries,
              notification engine, delivery adapters, recommendation engine)
  jobs/       node-cron: daily rollup, inactivity sweep, scheduled notification
              rules, nightly recommendation generation
  docs/       hand-written OpenAPI spec for the public ingestion API
```
