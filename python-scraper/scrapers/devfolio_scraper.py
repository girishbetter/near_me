"""Devfolio hackathon scraper.

Devfolio exposes a public hackathon search endpoint that the website
itself uses. We POST queries against it and paginate by adjusting `from`.

  POST https://api.devfolio.co/api/search/hackathons
  body: {"type": "application", "from": <int>, "size": <int>}
"""
from __future__ import annotations

import asyncio
import logging
from typing import Iterable

import httpx

from models.raw_event import RawEvent
from scrapers.base import BaseScraper, random_user_agent

logger = logging.getLogger(__name__)

DEVFOLIO_URL = "https://api.devfolio.co/api/search/hackathons"
PAGE_SIZE = 25
MAX_PAGES = 6
TIMEOUT = 20.0


def _entry_to_raw(hit: dict) -> RawEvent | None:
    src = hit.get("_source") or hit
    name = (src.get("name") or src.get("title") or "").strip()
    slug = src.get("slug") or src.get("hackathon_slug")
    if not name or not slug:
        return None
    url = f"https://{slug}.devfolio.co/" if "." not in str(slug) else f"https://{slug}/"

    starts_at = src.get("starts_at") or src.get("hackathon_setting", {}).get("application_start_date")
    ends_at = src.get("ends_at") or src.get("hackathon_setting", {}).get("application_end_date")

    location = src.get("city") or src.get("location") or None
    is_online = src.get("is_online")
    if is_online is True:
        mode = "online"
    elif is_online is False:
        mode = "offline"
    else:
        mode = "unknown"

    themes = src.get("themes") or src.get("primary_track") or []
    if isinstance(themes, list):
        tags = [t.get("name") if isinstance(t, dict) else str(t) for t in themes]
        tags = [t for t in tags if t]
    else:
        tags = []

    image = (
        src.get("hackathon_setting", {}).get("logo")
        if isinstance(src.get("hackathon_setting"), dict)
        else None
    )

    return RawEvent(
        title=name,
        platform="devfolio",
        url=url,
        image=image,
        start_date=starts_at,
        end_date=ends_at,
        mode=mode,
        tags=tags,
        organizer=src.get("organization_name") or None,
        location=location,
        type="hackathon",
        description=src.get("desc") or src.get("tagline") or None,
    )


async def _fetch_page(client: httpx.AsyncClient, offset: int) -> list[dict]:
    body = {"type": "application", "from": offset, "size": PAGE_SIZE}
    try:
        r = await client.post(DEVFOLIO_URL, json=body, timeout=TIMEOUT)
        r.raise_for_status()
        data = r.json()
        # The API has historically returned either {hits: {hits: [...]}} (ES-style)
        # or a flat {hackathons: [...]}. Handle both.
        hits = (
            data.get("hits", {}).get("hits")
            if isinstance(data.get("hits"), dict)
            else None
        )
        if hits is None:
            hits = data.get("hackathons") or data.get("results") or []
        return hits or []
    except Exception as exc:  # noqa: BLE001
        logger.warning("[devfolio] offset %s failed: %s", offset, exc)
        return []


async def _scrape_async() -> list[RawEvent]:
    headers = {
        "User-Agent": random_user_agent(),
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Origin": "https://devfolio.co",
        "Referer": "https://devfolio.co/",
    }
    seen: set[str] = set()
    out: list[RawEvent] = []
    async with httpx.AsyncClient(headers=headers) as client:
        for page in range(MAX_PAGES):
            offset = page * PAGE_SIZE
            entries = await _fetch_page(client, offset)
            if not entries:
                break
            new_count = 0
            for hit in entries:
                ev = _entry_to_raw(hit)
                if not ev or ev.url in seen:
                    continue
                seen.add(ev.url)
                out.append(ev)
                new_count += 1
            if new_count == 0:
                break
            await asyncio.sleep(0.5)
    return out


class DevfolioScraper(BaseScraper):
    source = "devfolio"

    async def scrape(self) -> Iterable[RawEvent]:
        return await _scrape_async()
