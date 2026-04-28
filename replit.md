# Workspace

## Overview

Tech Events Hub — a full-stack monorepo aggregator for tech events
(hackathons, webinars, workshops). Scrapes multiple platforms (Unstop,
Devpost, Eventbrite stub), normalizes the data, stores it in PostgreSQL,
and serves it through a REST API consumed by a React frontend.

## Artifacts

- `artifacts/events-hub` — React + Vite frontend (web), preview path `/`.
  Pages: Home, Browse (filterable grid), EventDetail, ScrapeControl.
- `artifacts/api-server` — Express 5 API server (`/api`).
  Handles events, stats aggregates, and scrape job orchestration.
- `artifacts/mockup-sandbox` — design mockup sandbox.

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
- `unstopScraper` and `devpostScraper` use each platform's public
  JSON listings; `eventbriteScraper` is a placeholder until credentials
  are available.
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
