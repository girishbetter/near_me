# Python Scraper Service

A standalone Python microservice that scrapes tech events from Devpost,
Devfolio, and Unstop and writes them into the **same** PostgreSQL
database used by the existing Node.js backend.

The Node.js backend is **not modified**. The Python service runs
independently and shares only the database (and its `events` /
`scrape_jobs` tables) with Node.

## Layout

```
python-scraper/
  scrapers/
    base.py              shared scraper interface + UA pool
    devpost_scraper.py   public Devpost JSON listing
    devfolio_scraper.py  Devfolio search API
    unstop_scraper.py    Playwright-driven Unstop scraping
  models/
    event_model.py       SQLAlchemy ORM bound to existing tables
    raw_event.py         raw event dataclass
  services/
    normalize.py         cleaning / dedupe helpers
    aggregator.py        run-all + upsert into shared DB
    scheduler.py         APScheduler (every 6h)
  db/database.py         SQLAlchemy engine bound to DATABASE_URL
  main.py                FastAPI app
  requirements.txt
```

## Run

```bash
cd python-scraper
pip install -r requirements.txt
playwright install chromium
uvicorn main:app --host 0.0.0.0 --port ${PORT:-8001}
```

## Endpoints

| Method | Path        | Description                              |
| ------ | ----------- | ---------------------------------------- |
| GET    | `/healthz`  | Liveness check                           |
| GET    | `/sources`  | List active scraper sources              |
| GET    | `/events`   | List events from the shared DB           |
| POST   | `/scrape`   | Trigger all scrapers (or `?source=...`)  |

## Environment

| Var                | Purpose                                                      |
| ------------------ | ------------------------------------------------------------ |
| `DATABASE_URL`     | Same Postgres URL used by the Node backend (required)        |
| `PORT`             | HTTP port (default 8001)                                     |
| `ENABLE_SCHEDULER` | `0` to disable the 6h scheduler                              |
| `UNSTOP_HEADLESS`  | `0` to launch a visible browser (debug only)                 |
| `LOG_LEVEL`        | `INFO` (default) / `DEBUG`                                   |

## Integration with Node

We use **Option A** from the spec: Python writes events directly into
the shared Postgres DB; the Node backend reads them via its existing
queries. URL uniqueness (the existing `events_url_unique` index) plus
the Python-side `INSERT ... ON CONFLICT DO UPDATE` ensure no duplicates.
