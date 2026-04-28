"""Lu.ma tech-events scraper.

Lu.ma exposes a public discover JSON endpoint that the website uses for
its category landing pages. We hit a few tech-relevant categories,
collect events, then keyword-filter the merged set."""
from __future__ import annotations

import asyncio
import logging
from typing import Iterable

import httpx

from models.raw_event import RawEvent
from scrapers.base import BaseScraper, random_user_agent

logger = logging.getLogger(__name__)

CATEGORY_ENDPOINT = "https://api.lu.ma/discover/get-paginated-events"
CATEGORIES = [
    "tech",
    "ai",
    "startup",
    "crypto",
]
PAGE_SIZE = 30
MAX_PAGES = 2
TIMEOUT = 20.0


def _entry_to_raw(item: dict) -> RawEvent | None:
    event = item.get("event") if isinstance(item.get("event"), dict) else item
    if not isinstance(event, dict):
        return None
    name = (event.get("name") or "").strip()
    api_id = event.get("api_id") or event.get("id")
    url_path = event.get("url") or (f"/event/{api_id}" if api_id else None)
    if not name or not url_path:
        return None
    if isinstance(url_path, str) and url_path.startswith("/"):
        url = f"https://lu.ma{url_path}"
    elif isinstance(url_path, str) and url_path.startswith("http"):
        url = url_path
    else:
        url = f"https://lu.ma/{url_path}"

    cover = event.get("cover_url") or event.get("og_image_url")
    geo = item.get("geo_address_info") or event.get("geo_address_info") or {}
    location = None
    if isinstance(geo, dict):
        location = geo.get("city_state") or geo.get("address") or geo.get("full_address")

    is_virtual = bool(event.get("is_virtual") or event.get("zoom_url"))
    mode = "online" if is_virtual else ("offline" if location else "unknown")

    tags: list[str] = []
    for k in ("categories", "tags"):
        v = item.get(k) or event.get(k)
        if isinstance(v, list):
            for entry in v:
                if isinstance(entry, dict):
                    name_t = entry.get("name") or entry.get("slug")
                else:
                    name_t = str(entry)
                if name_t:
                    tags.append(name_t)

    return RawEvent(
        title=name,
        platform="luma",
        url=url,
        image=cover if isinstance(cover, str) else None,
        start_date=event.get("start_at"),
        end_date=event.get("end_at") or event.get("start_at"),
        location=location,
        mode=mode,
        tags=tags,
        organizer=(event.get("hosts") or [{}])[0].get("name")
        if isinstance(event.get("hosts"), list) and event.get("hosts")
        else None,
        type="other",
        description=event.get("description_short"),
    )


async def _fetch_category(client: httpx.AsyncClient, slug: str) -> list[RawEvent]:
    out: list[RawEvent] = []
    seen: set[str] = set()
    cursor: str | None = None
    for _ in range(MAX_PAGES):
        params = {"slug": slug, "pagination_limit": PAGE_SIZE}
        if cursor:
            params["pagination_cursor"] = cursor
        try:
            r = await client.get(CATEGORY_ENDPOINT, params=params, timeout=TIMEOUT)
            if r.status_code != 200:
                logger.info("[luma] %s status=%s", slug, r.status_code)
                break
            payload = r.json()
        except Exception as exc:  # noqa: BLE001
            logger.info("[luma] %s fetch failed: %s", slug, exc)
            break
        entries = payload.get("entries") or payload.get("events") or []
        if not isinstance(entries, list) or not entries:
            break
        new = 0
        for item in entries:
            ev = _entry_to_raw(item)
            if not ev or ev.url in seen:
                continue
            seen.add(ev.url)
            out.append(ev)
            new += 1
        cursor = payload.get("next_cursor") or payload.get("cursor")
        if not cursor or new == 0:
            break
        await asyncio.sleep(0.3)
    return out


async def _scrape_async() -> list[RawEvent]:
    headers = {
        "User-Agent": random_user_agent(),
        "Accept": "application/json",
        "Origin": "https://lu.ma",
        "Referer": "https://lu.ma/",
    }
    out: list[RawEvent] = []
    seen: set[str] = set()
    async with httpx.AsyncClient(headers=headers) as client:
        for slug in CATEGORIES:
            try:
                results = await _fetch_category(client, slug)
            except Exception as exc:  # noqa: BLE001
                logger.warning("[luma] category %s errored: %s", slug, exc)
                continue
            for ev in results:
                if ev.url in seen:
                    continue
                seen.add(ev.url)
                out.append(ev)
    return out


class LumaScraper(BaseScraper):
    source = "luma"

    async def scrape(self) -> Iterable[RawEvent]:
        return await _scrape_async()
