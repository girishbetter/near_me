"""HackerEarth hackathons + challenges scraper.

The chrome-ext JSON feed has been retired. We scrape the public
`/challenges/hackathon/` and `/challenges/competitive/` pages, which
render as HTML cards under `.challenge-card-wrapper.challenge-card-link`."""
from __future__ import annotations

import asyncio
import logging
from typing import Iterable

import requests
from bs4 import BeautifulSoup

from models.raw_event import RawEvent
from scrapers.base import BaseScraper, random_user_agent

logger = logging.getLogger(__name__)

LISTING_URLS = [
    "https://www.hackerearth.com/challenges/hackathon/",
    "https://www.hackerearth.com/challenges/competitive/",
]
TIMEOUT = 20


def _parse_card(card) -> RawEvent | None:
    href = card.get("href")
    if not href:
        link = card.select_one("a[href]")
        if not link:
            return None
        href = link.get("href")
    if not href:
        return None
    if href.startswith("/"):
        href = f"https://www.hackerearth.com{href}"
    if "hackerearth.com" not in href:
        return None

    title_el = card.select_one(".challenge-name, .challenge-list-title, h3, .name") or card
    title = title_el.get_text(" ", strip=True)
    if not title or len(title) < 3:
        return None

    desc_el = card.select_one(".challenge-desc, .challenge-tagline, .description")
    description = desc_el.get_text(" ", strip=True) if desc_el else None

    img = card.select_one("img")
    image = img.get("src") if img else None
    if image and image.startswith("//"):
        image = f"https:{image}"

    date_el = card.select_one(".challenge-list-date, .date, .timing, .registration-status")
    date_text = date_el.get_text(" ", strip=True) if date_el else None

    org_el = card.select_one(".challenge-org-name, .company-name, .organisation")
    organizer = org_el.get_text(" ", strip=True) if org_el else None

    return RawEvent(
        title=title[:200],
        platform="hackerearth",
        url=href,
        image=image,
        description=description,
        start_date=date_text,
        end_date=date_text,
        organizer=organizer,
        type="hackathon",
        mode="online",
    )


def _scrape_url(url: str) -> list[RawEvent]:
    headers = {
        "User-Agent": random_user_agent(),
        "Accept": "text/html,application/xhtml+xml",
    }
    try:
        r = requests.get(url, headers=headers, timeout=TIMEOUT)
        if r.status_code != 200:
            logger.info("[hackerearth] %s -> %s", url, r.status_code)
            return []
    except Exception as exc:  # noqa: BLE001
        logger.warning("[hackerearth] %s fetch failed: %s", url, exc)
        return []

    soup = BeautifulSoup(r.text, "lxml")
    out: list[RawEvent] = []
    seen: set[str] = set()

    cards = soup.select("a.challenge-card-wrapper.challenge-card-link, .challenge-card, .challenge-card-modern")
    for card in cards:
        try:
            ev = _parse_card(card)
        except Exception:
            continue
        if not ev or ev.url in seen:
            continue
        seen.add(ev.url)
        out.append(ev)
    logger.info("[hackerearth] %s -> %d events", url, len(out))
    return out


def _scrape_sync() -> list[RawEvent]:
    out: list[RawEvent] = []
    seen: set[str] = set()
    for url in LISTING_URLS:
        for ev in _scrape_url(url):
            if ev.url in seen:
                continue
            seen.add(ev.url)
            out.append(ev)
    return out


class HackerEarthScraper(BaseScraper):
    source = "hackerearth"

    async def scrape(self) -> Iterable[RawEvent]:
        return await asyncio.to_thread(_scrape_sync)
