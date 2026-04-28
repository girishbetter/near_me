"""MLH (Major League Hacking) season events scraper.

`mlh.io/seasons/{year}/events` redirects to `mlh.com/seasons/{year}/events`.
The page lists each hackathon as an external anchor tagged with the
MLH UTM tracking params, so we extract those anchors directly."""
from __future__ import annotations

import asyncio
import logging
import re
from datetime import datetime
from typing import Iterable
from urllib.parse import unquote

import requests
from bs4 import BeautifulSoup

from models.raw_event import RawEvent
from scrapers.base import BaseScraper, random_user_agent

logger = logging.getLogger(__name__)

TIMEOUT = 20
HEADERS = {
    "User-Agent": random_user_agent(),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


def _seasons_to_try() -> list[int]:
    year = datetime.utcnow().year
    return [year, year + 1]


_UTM_RE = re.compile(r"utm_source=mlh.*?utm_medium=referral.*?utm_campaign=events", re.I)


def _utm_event_name(href: str) -> str | None:
    m = re.search(r"utm_content=([^&]+)", href)
    if not m:
        return None
    return unquote(m.group(1)).replace("+", " ").strip()


def _scrape_season(year: int) -> list[RawEvent]:
    url = f"https://mlh.io/seasons/{year}/events"
    try:
        r = requests.get(url, headers=HEADERS, timeout=TIMEOUT, allow_redirects=True)
        if r.status_code != 200:
            logger.warning("[mlh] %s -> %s", url, r.status_code)
            return []
    except Exception as exc:  # noqa: BLE001
        logger.warning("[mlh] %s fetch failed: %s", url, exc)
        return []

    soup = BeautifulSoup(r.text, "lxml")
    out: list[RawEvent] = []
    seen: set[str] = set()

    for a in soup.find_all("a", href=True):
        href = a["href"]
        if not _UTM_RE.search(href):
            continue
        # Strip the tracking params for a cleaner storage URL.
        clean_url = href.split("?")[0]
        if clean_url in seen:
            continue
        seen.add(clean_url)

        title = a.get_text(" ", strip=True) or _utm_event_name(href)
        if not title:
            continue

        # Walk up to the closest container to find date/location text.
        container = a
        for _ in range(4):
            if container.parent and container.parent.name not in ("body", "html"):
                container = container.parent
            else:
                break
        ctx_text = container.get_text(" ", strip=True) if container is not a else ""

        date_match = re.search(
            r"(?:[A-Z][a-z]{2,9}\.?\s+\d{1,2}(?:\s*[-–]\s*\d{1,2})?(?:,\s*\d{4})?)",
            ctx_text,
        )
        date_str = date_match.group(0) if date_match else None

        # MLH lists "Digital Only" or "City, ST/Country".
        loc_match = re.search(
            r"(Digital Only|[A-Z][a-zA-Z .]+,\s*[A-Z]{2,}|[A-Z][a-zA-Z]+,\s*[A-Z][a-zA-Z]+)",
            ctx_text,
        )
        location = loc_match.group(0) if loc_match else None
        mode = "online" if location and "digital" in location.lower() else (
            "offline" if location else "unknown"
        )

        img = container.find("img") if container is not a else None
        image = img.get("src") if img else None
        if image and image.startswith("//"):
            image = f"https:{image}"

        out.append(
            RawEvent(
                title=title[:200],
                platform="mlh",
                url=clean_url,
                image=image,
                start_date=date_str,
                end_date=date_str,
                location=location,
                mode=mode,
                organizer="Major League Hacking",
                type="hackathon",
            )
        )

    logger.info("[mlh] season %s -> %d events", year, len(out))
    return out


def _scrape_sync() -> list[RawEvent]:
    out: list[RawEvent] = []
    seen: set[str] = set()
    for year in _seasons_to_try():
        for ev in _scrape_season(year):
            if ev.url in seen:
                continue
            seen.add(ev.url)
            out.append(ev)
        if out:
            break  # Current season is enough.
    return out


class MLHScraper(BaseScraper):
    source = "mlh"

    async def scrape(self) -> Iterable[RawEvent]:
        return await asyncio.to_thread(_scrape_sync)
