"""APScheduler wrapper that triggers run_all() every 6 hours."""
from __future__ import annotations

import asyncio
import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from services.aggregator import run_all

logger = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None


async def _job() -> None:
    logger.info("[scheduler] kicking off scheduled scrape run")
    try:
        results = await run_all()
        logger.info("[scheduler] run complete: %s", results)
    except Exception as exc:  # noqa: BLE001
        logger.exception("[scheduler] run failed: %s", exc)


def start_scheduler() -> AsyncIOScheduler:
    global _scheduler
    if _scheduler is not None:
        return _scheduler
    _scheduler = AsyncIOScheduler(timezone="UTC")
    _scheduler.add_job(
        _job,
        trigger=IntervalTrigger(hours=6),
        id="run_all_scrapers",
        max_instances=1,
        coalesce=True,
        replace_existing=True,
    )
    _scheduler.start()
    logger.info("[scheduler] APScheduler started (every 6h)")

    # Kick off an initial run shortly after boot so the DB is populated.
    async def _initial_kick():
        await asyncio.sleep(20)
        await _job()

    asyncio.get_event_loop().create_task(_initial_kick())
    return _scheduler


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
