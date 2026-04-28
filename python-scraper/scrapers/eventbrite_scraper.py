"""Eventbrite scraper.

Eventbrite shut down their public search API, so we scrape the public
discovery pages instead. Each discovery page embeds a SERVER_DATA JSON
blob in a <script> tag — that's our cheapest path to structured data."""
from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Iterable

import requests
from bs4 import BeautifulSoup

from models.raw_event import RawEvent
from scrapers.base import BaseScraper, random_user_agent

logger = logging.getLogger(__name__)

SEARCH_URLS = [
    "https://www.eventbrite.com/d/online/hackathon/",
    "https://www.eventbrite.com/d/online/developer/",
    "https://www.eventbrite.com/d/online/coding/",
]
TIMEOUT = 15


_SERVER_DATA_RE = re.compile(
    r"window\.__SERVER_DATA__\s*=\s*(\{.*?\});", re.DOTALL
)


def _events_from_server_data(data: dict) -> list[dict]:
    """Walk the SERVER_DATA blob; events live at search_data.events.results
    (or older shapes). Return a flat list of event dicts."""
    candidates: list[dict] = []
    if not isinstance(data, dict):
        return candidates

    # Newer shape
    sd = data.get("search_data")
    if isinstance(sd, dict):
        events = sd.get("events")
        if isinstance(events, dict):
            res = events.get("results")
            if isinstance(res, list):
                candidates.extend([e for e in res if isinstance(e, dict)])
        elif isinstance(events, list):
            candidates.extend([e for e in events if isinstance(e, dict)])

    # Older shape: data.results
    res2 = data.get("results")
    if isinstance(res2, list):
        candidates.extend([e for e in res2 if isinstance(e, dict)])

    return candidates


def _parse_event(entry: dict) -> RawEvent | None:
    title = (entry.get("name") or entry.get("title") or "").strip()
    url = entry.get("url") or entry.get("ticket_url")
    if not title or not url:
        return None

    image = None
    img = entry.get("image") or entry.get("primary_image")
    if isinstance(img, dict):
        image = img.get("original", {}).get("url") or img.get("url")
    elif isinstance(img, str):
        image = img

    start = entry.get("start_date") or entry.get("start", {}).get("local") if isinstance(entry.get("start"), dict) else entry.get("start_date")
    end = entry.get("end_date") or entry.get("end", {}).get("local") if isinstance(entry.get("end"), dict) else entry.get("end_date")

    location = None
    venue = entry.get("primary_venue") or entry.get("venue")
    if isinstance(venue, dict):
        location = venue.get("name") or (venue.get("address") or {}).get("city")
    is_online = bool(entry.get("is_online_event") or entry.get("online_event"))
    mode = "online" if is_online else ("offline" if location else "unknown")

    organizer = None
    org = entry.get("primary_organizer") or entry.get("organizer")
    if isinstance(org, dict):
        organizer = org.get("name")

    tags = []
    for k in ("tags", "categories"):
        v = entry.get(k)
        if isinstance(v, list):
            for t in v:
                if isinstance(t, dict):
                    name = t.get("name") or t.get("display_name")
                else:
                    name = str(t)
                if name:
                    tags.append(name)

    return RawEvent(
        title=title,
        platform="eventbrite",
        url=url,
        image=image,
        start_date=start,
        end_date=end,
        location=location,
        mode=mode,
        organizer=organizer,
        tags=tags,
        type="hackathon" if "hack" in title.lower() else "other",
    )


def _scrape_url(url: str) -> list[RawEvent]:
    headers = {"User-Agent": random_user_agent()}
    try:
        r = requests.get(url, headers=headers, timeout=TIMEOUT)
        if r.status_code != 200:
            logger.info("[eventbrite] %s status=%s", url, r.status_code)
            return []
    except Exception as exc:  # noqa: BLE001
        logger.warning("[eventbrite] %s fetch failed: %s", url, exc)
        return []

    out: list[RawEvent] = []
    seen: set[str] = set()

    m = _SERVER_DATA_RE.search(r.text)
    if m:
        try:
            data = json.loads(m.group(1))
            for entry in _events_from_server_data(data):
                ev = _parse_event(entry)
                if ev and ev.url not in seen:
                    seen.add(ev.url)
                    out.append(ev)
        except Exception as exc:  # noqa: BLE001
            logger.info("[eventbrite] SERVER_DATA parse failed: %s", exc)

    if not out:
        # Last-resort DOM scrape.
        soup = BeautifulSoup(r.text, "lxml")
        for a in soup.select('a[href*="eventbrite.com/e/"]'):
            href = a.get("href")
            if not href or href in seen:
                continue
            title = a.get_text(strip=True)
            if not title or len(title) < 4:
                continue
            seen.add(href)
            out.append(
                RawEvent(
                    title=title[:200],
                    platform="eventbrite",
                    url=href,
                    type="hackathon" if "hack" in title.lower() else "other",
                    mode="online",
                )
            )
    return out


def _scrape_sync() -> list[RawEvent]:
    out: list[RawEvent] = []
    seen: set[str] = set()
    for url in SEARCH_URLS:
        for ev in _scrape_url(url):
            if ev.url in seen:
                continue
            seen.add(ev.url)
            out.append(ev)
    return out


class EventbriteScraper(BaseScraper):
    source = "eventbrite"

    async def scrape(self) -> Iterable[RawEvent]:
        return await asyncio.to_thread(_scrape_sync)
