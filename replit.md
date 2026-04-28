# Workspace

## Overview

Tech Events Hub — a full-stack monorepo aggregator for tech events
(hackathons, webinars, workshops). Scrapes multiple platforms (Unstop,
Devpost, Devfolio, Eventbrite stub), normalizes the data, performs
cross-platform deduplication, stores it in PostgreSQL, and serves it
through a REST API consumed by a React frontend. A scheduler refreshes
all sources every 8 hours.

## Artifacts

- `artifacts/events-hub` — React + Vite frontend (web), preview path `/`.
  Pages: Home, Browse (filterable grid), EventDetail, ScrapeControl.
- `artifacts/api-server` — Express 5 API server (`/api`).
  Handles events, stats aggregates, and scrape job orchestration.
- `artifacts/mockup-sandbox` — design mockup sandbox.

## Standalone Services (outside /artifacts)

- `python-scraper/` — FastAPI microservice that scrapes Devpost,
  Devfolio, and Unstop using a hybrid stack (`requests` + `httpx` +
  Playwright). Writes events directly into the **same** Postgres DB the
  Node API reads from, using SQLAlchemy + `INSERT ... ON CONFLICT (url)
  DO UPDATE` for idempotent upserts. Schema is owned by the Node side
  (Drizzle) — Python only attaches to the existing `events` and
  `scrape_jobs` tables.
  - Workflow: `Python Scraper Service` (uvicorn on port 8000)
  - Endpoints: `GET /healthz`, `GET /sources`, `GET /events`,
    `POST /scrape[?source=...]`
  - APScheduler triggers `run_all` every 6 hours (initial run 20s after
    boot). Concurrency limited to 2 scrapers at a time.
  - Unstop uses async Playwright (Chromium) with random user agents,
    stealth init script, infinite-scroll detection, and graceful
    fallback when the browser cannot launch.

## Stack

- **Monorepo**: pnpm workspaces
- **Node.js**: 24
- **TypeScript**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Frontend**: React + Vite + Tailwind + shadcn/ui + framer-motion +
  TanStack Query (via generated hooks)
- **Build**: esbuild (CJS bundle for the API server)

## Scraping

- Each source has its own module under
  `artifacts/api-server/src/scrapers/` and implements the `Scraper`
  interface (`source`, `scrape() => Promise<InsertEvent[]>`).
- `unstopScraper`, `devpostScraper`, and `devfolioScraper` use each
  platform's public JSON listings; `eventbriteScraper` is a placeholder
  until credentials are available.
- `devfolioScraper` calls `POST https://api.devfolio.co/api/search/hackathons`.
  Devfolio's public search endpoint silently ignores all filter
  parameters and currently returns mostly archived (2021-2023) records.
  The pipeline-level stale-event filter (60 days past `endDate`) drops
  these so they never reach the dashboard. Source remains wired so it
  becomes useful as soon as their API exposes live data again.
- After all sources scrape, raw events flow through
  `crossPlatformDedupe` (`artifacts/api-server/src/lib/crossPlatformDedupe.ts`),
  which merges duplicates across sources using Jaccard token similarity
  on titles (≥0.7) combined with a date-overlap window (≤7 days). When
  duplicates collide the more complete record wins.
- The 8-hour scheduler in `artifacts/api-server/src/lib/scheduler.ts`
  drives `runAllScrapers` automatically.
- All scrapers emit raw events that flow through `normalizeEvent()`
  (`artifacts/api-server/src/lib/normalize.ts`) into the unified shape.
- `scraperRunner.ts` upserts events by URL (duplicate prevention) and
  records every run as a row in `scrape_jobs`.
- `scheduler.ts` triggers `runAllScrapers()` every 6 hours, with an
  initial run 30s after server boot. `POST /api/scrape` triggers a
  manual run (optionally scoped to a single source).
- The API server seeds 12 curated example events on first boot so the
  app feels alive even before live scrapes succeed.

## Database

- `events`: id, title, platform, type, url (unique), image, start_date,
  end_date, mode, tags[], organizer, location, prize, description,
  created_at, updated_at.
- `scrape_jobs`: id, source, status (running/success/error),
  events_found, events_upserted, error_message, started_at, finished_at.

## API

All routes mounted under `/api`:

- `GET  /healthz`
- `GET  /events?type&platform&mode&tag&search&limit&offset`
- `POST /events` (manual event creation, body must include `title`,
  valid `https://` `url`, `type`, `mode`)
- `GET  /events/:id`
- `GET  /stats/overview`
- `GET  /stats/trending-tags?limit`
- `GET  /stats/upcoming-deadlines?limit`
- `POST /scrape` (body: `{ source?: string }`)
- `GET  /scrape/jobs?limit`

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks
  and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev)
- `pnpm --filter @workspace/api-server run dev` — run the API server

See the `pnpm-workspace` skill for monorepo structure details.
