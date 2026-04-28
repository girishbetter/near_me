"""Aggregator: runs all scrapers concurrently, normalizes + dedupes the
results, then upserts them into the shared Postgres `events` table and
records a row in `scrape_jobs`."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from db.database import session_scope
from models.event_model import Event, ScrapeJob
from models.raw_event import RawEvent
from scrapers.base import BaseScraper
from scrapers.devfolio_scraper import DevfolioScraper
from scrapers.devpost_scraper import DevpostScraper
from scrapers.unstop_scraper import UnstopScraper
from services.normalize import normalize_event

logger = logging.getLogger(__name__)


def get_scrapers() -> list[BaseScraper]:
    return [DevpostScraper(), DevfolioScraper(), UnstopScraper()]


def get_scraper(source: str) -> BaseScraper | None:
    for s in get_scrapers():
        if s.source == source:
            return s
    return None


def _dedupe_by_url(rows: Iterable[dict]) -> list[dict]:
    by_url: dict[str, dict] = {}
    for row in rows:
        url = row.get("url")
        if not url:
            continue
        existing = by_url.get(url)
        if existing is None:
            by_url[url] = row
            continue
        # Keep the row with more populated fields.
        score_existing = sum(1 for v in existing.values() if v not in (None, "", []))
        score_new = sum(1 for v in row.values() if v not in (None, "", []))
        if score_new > score_existing:
            by_url[url] = row
    return list(by_url.values())


def _sort_by_date(rows: list[dict]) -> list[dict]:
    def key(r: dict):
        end = r.get("end_date")
        start = r.get("start_date")
        d = end or start
        if d is None:
            return (1, datetime.max.replace(tzinfo=timezone.utc))
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        return (0, d)
    return sorted(rows, key=key)


def _upsert_events(rows: list[dict]) -> int:
    if not rows:
        return 0
    upserted = 0
    now = datetime.now(timezone.utc)
    with session_scope() as session:
        for row in rows:
            payload = {**row, "created_at": now, "updated_at": now}
            stmt = pg_insert(Event).values(**payload)
            update_cols = {
                k: stmt.excluded[k]
                for k in (
                    "title",
                    "platform",
                    "type",
                    "image",
                    "start_date",
                    "end_date",
                    "mode",
                    "tags",
                    "organizer",
                    "location",
                    "prize",
                    "description",
                    "updated_at",
                )
            }
            stmt = stmt.on_conflict_do_update(
                index_elements=[Event.url], set_=update_cols
            )
            session.execute(stmt)
            upserted += 1
    return upserted


def _record_job(
    source: str,
    status: str,
    started_at: datetime,
    found: int,
    upserted: int,
    error: str | None = None,
) -> None:
    with session_scope() as session:
        session.add(
            ScrapeJob(
                source=source,
                status=status,
                events_found=found,
                events_upserted=upserted,
                error_message=error,
                started_at=started_at,
                finished_at=datetime.now(timezone.utc),
            )
        )


async def run_scraper(scraper: BaseScraper) -> dict:
    started_at = datetime.now(timezone.utc)
    raw_events: list[RawEvent] = []
    error: str | None = None
    try:
        raw_events = await scraper.safe_scrape()
    except Exception as exc:  # noqa: BLE001
        error = str(exc)
        logger.exception("[%s] unhandled error: %s", scraper.source, exc)

    normalized = [
        n
        for n in (normalize_event(r, scraper.source) for r in raw_events)
        if n is not None
    ]
    deduped = _dedupe_by_url(normalized)
    upserted = 0
    try:
        upserted = _upsert_events(deduped)
    except Exception as exc:  # noqa: BLE001
        error = (error + " | " if error else "") + f"upsert failed: {exc}"
        logger.exception("[%s] upsert failed: %s", scraper.source, exc)

    status = "error" if error else "success"
    _record_job(
        source=scraper.source,
        status=status,
        started_at=started_at,
        found=len(raw_events),
        upserted=upserted,
        error=error,
    )
    logger.info(
        "[%s] done: found=%d upserted=%d status=%s",
        scraper.source,
        len(raw_events),
        upserted,
        status,
    )
    return {
        "source": scraper.source,
        "found": len(raw_events),
        "upserted": upserted,
        "status": status,
        "error": error,
    }


async def run_all() -> list[dict]:
    scrapers = get_scrapers()
    # Limit concurrency: keep API + Playwright out of each other's way.
    sem = asyncio.Semaphore(2)

    async def _bounded(s: BaseScraper):
        async with sem:
            return await run_scraper(s)

    results = await asyncio.gather(*[_bounded(s) for s in scrapers])
    return list(results)


def list_events(limit: int = 100, offset: int = 0) -> list[dict]:
    with session_scope() as session:
        stmt = (
            select(Event)
            .order_by(Event.end_date.asc().nullslast(), Event.id.desc())
            .limit(limit)
            .offset(offset)
        )
        rows = session.execute(stmt).scalars().all()
        return [
            {
                "id": e.id,
                "title": e.title,
                "platform": e.platform,
                "type": e.type,
                "url": e.url,
                "image": e.image,
                "start_date": e.start_date.isoformat() if e.start_date else None,
                "end_date": e.end_date.isoformat() if e.end_date else None,
                "mode": e.mode,
                "tags": list(e.tags or []),
                "organizer": e.organizer,
                "location": e.location,
                "prize": e.prize,
                "description": e.description,
            }
            for e in rows
        ]
