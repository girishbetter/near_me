"""FastAPI entrypoint for the Python scraping microservice.

Runs alongside the existing Node.js backend. Writes into the same
Postgres `events` table that the Node API reads from.

Usage:
  cd python-scraper
  pip install -r requirements.txt
  playwright install chromium
  uvicorn main:app --host 0.0.0.0 --port ${PORT:-8001}
"""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query

from services.aggregator import (
    get_scraper,
    get_scrapers,
    list_events,
    run_all,
    run_scraper,
)
from services.scheduler import start_scheduler, stop_scheduler

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("python-scraper")


@asynccontextmanager
async def lifespan(app: FastAPI):
    enable_scheduler = os.getenv("ENABLE_SCHEDULER", "1") != "0"
    if enable_scheduler:
        start_scheduler()
    else:
        logger.info("scheduler disabled via ENABLE_SCHEDULER=0")
    try:
        yield
    finally:
        stop_scheduler()


app = FastAPI(
    title="Tech Events Hub — Python Scraper",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/healthz")
def healthz() -> dict:
    return {"ok": True, "service": "python-scraper"}


@app.get("/sources")
def sources() -> dict:
    return {"sources": [s.source for s in get_scrapers()]}


@app.get("/events")
def events(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> dict:
    rows = list_events(limit=limit, offset=offset)
    return {"events": rows, "count": len(rows), "limit": limit, "offset": offset}


@app.post("/scrape")
async def scrape(source: str | None = None) -> dict:
    if source:
        scraper = get_scraper(source)
        if scraper is None:
            raise HTTPException(404, f"unknown source: {source}")
        result = await run_scraper(scraper)
        return {"results": [result]}
    results = await run_all()
    return {"results": results}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8001")),
        reload=False,
    )
