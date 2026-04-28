"""Geocoding service.

Uses the free OpenStreetMap Nominatim API. Every call respects the
project's caching contract (the `geocode_cache` table) and the
Nominatim usage policy (≤ 1 req/sec, descriptive User-Agent).

This module deliberately lives on the Python side because new events
flow in through the Python scrapers — the moment a scraper upserts a
new row we have an opportunity to geocode it without a second pass."""
from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timezone
from typing import Optional

import httpx
from sqlalchemy import select, text, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

from db.database import session_scope
from models.event_model import Event
from models.geocode_cache import GeocodeCache

logger = logging.getLogger(__name__)

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = os.getenv(
    "NOMINATIM_USER_AGENT",
    "TechEventsHub/1.0 (https://replit.com; geocoding for event listings)",
)
RATE_LIMIT_SECONDS = 1.1  # Nominatim policy: ≤ 1 req/s.
MAX_PER_RUN = 40  # Cap so a giant first run doesn't take 30+ minutes.
TIMEOUT = 10.0
MAX_NOT_FOUND_RETRIES = 3  # Try at most N times before giving up forever.

_request_lock = asyncio.Lock()
_last_call_at: float = 0.0


def _normalize(loc: str) -> str:
    return " ".join(loc.split()).strip().lower()


def _looks_unhelpful(loc: str) -> bool:
    """Filter out values that won't geocode usefully."""
    norm = _normalize(loc)
    if not norm or len(norm) < 3:
        return True
    if norm in {"online", "virtual", "remote", "digital only", "tbd", "tba", "anywhere"}:
        return True
    return False


async def _call_nominatim(client: httpx.AsyncClient, location: str) -> Optional[dict]:
    """Single rate-limited call. Returns the first result dict or None."""
    global _last_call_at
    async with _request_lock:
        now = asyncio.get_event_loop().time()
        wait = RATE_LIMIT_SECONDS - (now - _last_call_at)
        if wait > 0:
            await asyncio.sleep(wait)
        try:
            r = await client.get(
                NOMINATIM_URL,
                params={"q": location, "format": "json", "limit": 1},
                headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
                timeout=TIMEOUT,
            )
        finally:
            _last_call_at = asyncio.get_event_loop().time()
    if r.status_code != 200:
        logger.info("[geocode] %r -> HTTP %s", location, r.status_code)
        return None
    try:
        results = r.json()
    except ValueError:
        return None
    if not results:
        return None
    return results[0]


def _read_cache(location: str) -> Optional[GeocodeCache]:
    with session_scope() as session:
        return session.execute(
            select(GeocodeCache).where(GeocodeCache.location == location)
        ).scalar_one_or_none()


def _write_cache(
    location: str,
    lat: Optional[float],
    lon: Optional[float],
    display_name: Optional[str],
    not_found_increment: int = 0,
) -> None:
    """Idempotent upsert into geocode_cache."""
    with session_scope() as session:
        stmt = pg_insert(GeocodeCache).values(
            location=location,
            latitude=lat,
            longitude=lon,
            display_name=display_name,
            not_found=not_found_increment,
            created_at=datetime.now(timezone.utc),
        )
        update_set = {
            "latitude": stmt.excluded.latitude,
            "longitude": stmt.excluded.longitude,
            "display_name": stmt.excluded.display_name,
            "not_found": GeocodeCache.not_found + not_found_increment,
        }
        stmt = stmt.on_conflict_do_update(
            index_elements=[GeocodeCache.location], set_=update_set
        )
        session.execute(stmt)


async def geocode_location(
    client: httpx.AsyncClient, location: str
) -> tuple[Optional[float], Optional[float]]:
    """Public entry point. Returns (lat, lon) or (None, None)."""
    if not location:
        return None, None
    norm = _normalize(location)
    if _looks_unhelpful(norm):
        return None, None

    cached = _read_cache(norm)
    if cached:
        if cached.latitude is not None and cached.longitude is not None:
            return cached.latitude, cached.longitude
        if cached.not_found >= MAX_NOT_FOUND_RETRIES:
            return None, None

    result = await _call_nominatim(client, location)
    if not result:
        _write_cache(norm, None, None, None, not_found_increment=1)
        return None, None

    try:
        lat = float(result["lat"])
        lon = float(result["lon"])
    except (KeyError, TypeError, ValueError):
        _write_cache(norm, None, None, None, not_found_increment=1)
        return None, None

    _write_cache(norm, lat, lon, result.get("display_name"))
    return lat, lon


def _events_needing_geocoding(limit: int) -> list[tuple[int, str]]:
    """Pick events with a location string but no coordinates yet."""
    with session_scope() as session:
        rows = session.execute(
            select(Event.id, Event.location)
            .where(Event.location.is_not(None))
            .where(Event.latitude.is_(None))
            .order_by(Event.id.desc())
            .limit(limit)
        ).all()
        return [(r[0], r[1]) for r in rows if r[1]]


def _apply_coords(event_id: int, lat: float, lon: float) -> None:
    with session_scope() as session:
        session.execute(
            update(Event)
            .where(Event.id == event_id)
            .values(latitude=lat, longitude=lon)
        )


async def enrich_missing_coordinates(max_calls: int = MAX_PER_RUN) -> dict:
    """Find events without coordinates, geocode them (cache-first), update DB.

    Returns a small summary suitable for logging."""
    pending = _events_needing_geocoding(max_calls * 4)
    if not pending:
        return {"processed": 0, "from_cache": 0, "from_api": 0, "missing": 0}

    processed = 0
    from_cache = 0
    from_api = 0
    missing = 0
    api_calls = 0

    async with httpx.AsyncClient() as client:
        for event_id, raw_loc in pending:
            if api_calls >= max_calls and from_api == api_calls:
                # We've already burned our API budget for this run.
                # Still finish processing things that might be cache hits.
                pass

            norm = _normalize(raw_loc)
            if _looks_unhelpful(norm):
                missing += 1
                continue

            cached = _read_cache(norm)
            if cached and cached.latitude is not None and cached.longitude is not None:
                _apply_coords(event_id, cached.latitude, cached.longitude)
                from_cache += 1
                processed += 1
                continue
            if cached and cached.not_found >= MAX_NOT_FOUND_RETRIES:
                missing += 1
                continue

            if api_calls >= max_calls:
                # Out of API budget and no cache; skip — we'll get it next run.
                continue

            api_calls += 1
            lat, lon = await geocode_location(client, raw_loc)
            if lat is not None and lon is not None:
                _apply_coords(event_id, lat, lon)
                from_api += 1
                processed += 1
            else:
                missing += 1

    summary = {
        "processed": processed,
        "from_cache": from_cache,
        "from_api": from_api,
        "missing": missing,
        "pending_remaining": max(0, len(pending) - processed - missing),
    }
    logger.info("[geocode] %s", summary)
    return summary
