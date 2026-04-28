"""Devpost hackathon scraper.

Devpost exposes a public JSON listing at:
  https://devpost.com/api/hackathons?page=N

We page through results and convert each entry into a RawEvent."""
from __future__ import annotations

import asyncio
import logging
from typing import Iterable

import requests

from models.raw_event import RawEvent
from scrapers.base import BaseScraper, random_user_agent

logger = logging.getLogger(__name__)

DEVPOST_API = "https://devpost.com/api/hackathons"
MAX_PAGES = 5
TIMEOUT = 15


def _parse_entry(item: dict) -> RawEvent | None:
    title = (item.get("title") or "").strip()
    url = (item.get("url") or "").strip()
    if not title or not url:
        return None

    submission = item.get("submission_period_dates") or ""
    deadline = item.get("deadline") or item.get("submission_period_end_date")
    start = item.get("submission_period_start_date") or item.get("open_state_changed_at")

    location = (item.get("displayed_location") or {}).get("location")
    is_online = (item.get("displayed_location") or {}).get("is_online")
    if is_online is True:
        mode = "online"
    elif is_online is False:
        mode = "offline"
    else:
        mode = "unknown"

    themes = item.get("themes") or []
    tags = [t.get("name") for t in themes if isinstance(t, dict) and t.get("name")]

    organizer = item.get("organization_name") or None
    prize = item.get("prize_amount") or None
    image = item.get("thumbnail_url") or None

    description = submission or None

    return RawEvent(
        title=title,
        platform="devpost",
        url=url,
        image=image,
        start_date=start,
        end_date=deadline,
        mode=mode,
        tags=tags,
        organizer=organizer,
        location=location,
        type="hackathon",
        prize=prize,
        description=description,
    )


def _fetch_page(page: int) -> list[dict]:
    headers = {
        "User-Agent": random_user_agent(),
        "Accept": "application/json",
    }
    try:
        r = requests.get(
            DEVPOST_API,
            params={"page": page, "status[]": "open"},
            headers=headers,
            timeout=TIMEOUT,
        )
        r.raise_for_status()
        body = r.json()
        return body.get("hackathons") or []
    except Exception as exc:  # noqa: BLE001
        logger.warning("[devpost] page %s failed: %s", page, exc)
        return []


def _scrape_sync() -> list[RawEvent]:
    seen_urls: set[str] = set()
    out: list[RawEvent] = []
    for page in range(1, MAX_PAGES + 1):
        entries = _fetch_page(page)
        if not entries:
            break
        new_in_page = 0
        for raw in entries:
            ev = _parse_entry(raw)
            if not ev or ev.url in seen_urls:
                continue
            seen_urls.add(ev.url)
            out.append(ev)
            new_in_page += 1
        if new_in_page == 0:
            break
    return out


class DevpostScraper(BaseScraper):
    source = "devpost"

    async def scrape(self) -> Iterable[RawEvent]:
        return await asyncio.to_thread(_scrape_sync)
