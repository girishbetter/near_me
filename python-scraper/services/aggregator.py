"""Aggregator: runs every scraper concurrently with retry + timeout, then
filters, cross-source dedupes, upserts into the shared `events` table,
and records each run in `scrape_jobs`."""
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
from scrapers.eventbrite_scraper import EventbriteScraper
from scrapers.hackerearth_scraper import HackerEarthScraper
from scrapers.luma_scraper import LumaScraper
from scrapers.mlh_scraper import MLHScraper
from scrapers.unstop_scraper import UnstopScraper
from services.dedupe import cross_source_dedupe, priority
from services.filter import filter_events
from services.normalize import normalize_event

logger = logging.getLogger(__name__)

# Per-scraper hard wall-clock cap (seconds). Anything still running gets
# cancelled — better one missing source than a stuck pipeline.
SCRAPER_TIMEOUT = 30.0
RETRY_ATTEMPTS = 2
CONCURRENCY = 3


def get_scrapers() -> list[BaseScraper]:
    """All scrapers, sorted by source priority (high → low)."""
    scrapers: list[BaseScraper] = [
        DevfolioScraper(),
        DevpostScraper(),
        UnstopScraper(),
        MLHScraper(),
        HackerEarthScraper(),
        LumaScraper(),
        EventbriteScraper(),
    ]
    scrapers.sort(key=lambda s: priority(s.source))
    return scrapers


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
        score_existing = sum(1 for v in existing.values() if v not in (None, "", []))
        score_new = sum(1 for v in row.values() if v not in (None, "", []))
        if score_new > score_existing:
            by_url[url] = row
    return list(by_url.values())


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
    try:
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
    except Exception as exc:  # noqa: BLE001
        logger.warning("[%s] could not record scrape_job: %s", source, exc)


async def _scrape_with_retry(scraper: BaseScraper) -> tuple[list[RawEvent], str | None]:
    """Run a single scraper with timeout + N retries.

    Returns (raw_events, error_string_or_none). A retry is attempted on
    *any* failure (timeout, network, parse). The last error message is
    returned so we can report it on the scrape_jobs row."""
    last_err: str | None = None
    for attempt in range(1, RETRY_ATTEMPTS + 1):
        try:
            results = await asyncio.wait_for(
                scraper.safe_scrape(), timeout=SCRAPER_TIMEOUT
            )
            return list(results), None
        except asyncio.TimeoutError:
            last_err = f"timeout after {SCRAPER_TIMEOUT}s"
            logger.warning("[%s] attempt %s timed out", scraper.source, attempt)
        except Exception as exc:  # noqa: BLE001
            last_err = f"{type(exc).__name__}: {exc}"
            logger.warning("[%s] attempt %s failed: %s", scraper.source, attempt, exc)
        if attempt < RETRY_ATTEMPTS:
            await asyncio.sleep(1.5 * attempt)
    return [], last_err


async def run_scraper(scraper: BaseScraper) -> dict:
    """Scrape a single source end-to-end (retry, normalize, filter, upsert)."""
    started_at = datetime.now(timezone.utc)
    raw_events, error = await _scrape_with_retry(scraper)

    normalized = [
        n
        for n in (normalize_event(r, scraper.source) for r in raw_events)
        if n is not None
    ]
    deduped = _dedupe_by_url(normalized)
    kept, dropped_filter = filter_events(deduped)

    upserted = 0
    if kept:
        try:
            upserted = _upsert_events(kept)
        except Exception as exc:  # noqa: BLE001
            error = (error + " | " if error else "") + f"upsert failed: {exc}"
            logger.exception("[%s] upsert failed: %s", scraper.source, exc)

    status = "error" if (error or len(raw_events) == 0) else "success"
    _record_job(
        source=scraper.source,
        status=status,
        started_at=started_at,
        found=len(raw_events),
        upserted=upserted,
        error=error,
    )

    duplicates_removed = len(normalized) - len(deduped)
    log = logger.error if status == "error" and not raw_events else logger.info
    log(
        "[%s] found=%d duplicates_removed=%d filter_dropped=%d upserted=%d status=%s",
        scraper.source,
        len(raw_events),
        duplicates_removed,
        dropped_filter,
        upserted,
        status,
    )

    return {
        "source": scraper.source,
        "priority": priority(scraper.source),
        "found": len(raw_events),
        "duplicates_removed": duplicates_removed,
        "filter_dropped": dropped_filter,
        "upserted": upserted,
        "status": status,
        "error": error,
    }


async def run_all() -> dict:
    """Run every scraper, then a final cross-source dedupe pass.

    Per-source upserts already happened in run_scraper. The cross-source
    pass here is just for reporting / observability (it tells us how many
    duplicates exist across sources that we collapsed at read time)."""
    scrapers = get_scrapers()
    sem = asyncio.Semaphore(CONCURRENCY)

    async def _bounded(s: BaseScraper):
        async with sem:
            return await run_scraper(s)

    # gather(return_exceptions=True) → one scraper crashing never takes
    # down the others.
    results = await asyncio.gather(
        *[_bounded(s) for s in scrapers], return_exceptions=True
    )
    clean: list[dict] = []
    for r in results:
        if isinstance(r, Exception):
            logger.exception("[run_all] scraper crashed: %s", r)
            continue
        clean.append(r)

    # Cross-source reporting pass on the freshly upserted rows.
    sample = list_events(limit=500)
    _, cross_dups = cross_source_dedupe(sample)

    summary = {
        "results": clean,
        "total_found": sum(r["found"] for r in clean),
        "total_upserted": sum(r["upserted"] for r in clean),
        "cross_source_duplicates": cross_dups,
        "sources_succeeded": sum(1 for r in clean if r["status"] == "success"),
        "sources_failed": sum(1 for r in clean if r["status"] == "error"),
    }
    logger.info("[run_all] summary: %s", summary)
    return summary


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
