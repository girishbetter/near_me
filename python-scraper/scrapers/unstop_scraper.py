"""Unstop competition scraper.

Unstop heavily protects its listing page, so we drive a real browser via
Playwright. We:
  * launch headless Chromium with stealth-y flags
  * disable the `navigator.webdriver` flag
  * scroll to trigger infinite-scroll until no new items appear
  * extract event cards with multiple fallback selectors

The implementation is defensive: if Playwright is not installed or the
selectors break, we log + return an empty list rather than crashing the
aggregator."""
from __future__ import annotations

import asyncio
import logging
import os
import random
from typing import Iterable

from models.raw_event import RawEvent
from scrapers.base import BaseScraper, random_user_agent

logger = logging.getLogger(__name__)

UNSTOP_URL = "https://unstop.com/competitions?oppstatus=open"
MAX_SCROLLS = 25
SCROLL_PAUSE_MIN = 0.8
SCROLL_PAUSE_MAX = 1.6
HEADLESS = os.getenv("UNSTOP_HEADLESS", "1") != "0"


_EXTRACT_JS = r"""
() => {
  const cards = Array.from(document.querySelectorAll(
    'app-competition-listing app-opportunity-card, app-opportunity-card, .single_profile, .opp-cards, [class*="opportunity"]'
  ));
  const seen = new Set();
  const out = [];
  for (const c of cards) {
    const a = c.querySelector('a[href]');
    const href = a ? a.href : null;
    if (!href || seen.has(href)) continue;
    seen.add(href);
    const titleEl = c.querySelector('h2, h3, .opp-title, [class*="title"]');
    const orgEl = c.querySelector('.organisation, .company, .org, [class*="organi"]');
    const imgEl = c.querySelector('img');
    const tagEls = c.querySelectorAll('.chip, .tag, [class*="tag"]');
    const tags = Array.from(tagEls).map(e => (e.textContent || '').trim()).filter(Boolean);
    out.push({
      title: titleEl ? titleEl.textContent.trim() : '',
      url: href,
      organizer: orgEl ? orgEl.textContent.trim() : null,
      image: imgEl ? imgEl.src : null,
      tags
    });
  }
  return out;
}
"""


async def _scrape_async() -> list[RawEvent]:
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        logger.warning("[unstop] playwright not installed; skipping")
        return []

    out: list[RawEvent] = []

    async with async_playwright() as p:
        try:
            browser = await p.chromium.launch(
                headless=HEADLESS,
                args=[
                    "--disable-blink-features=AutomationControlled",
                    "--no-sandbox",
                    "--disable-dev-shm-usage",
                ],
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("[unstop] could not launch browser: %s", exc)
            return []

        context = await browser.new_context(
            user_agent=random_user_agent(),
            viewport={"width": 1366, "height": 900},
            locale="en-US",
        )
        # Hide the webdriver flag.
        await context.add_init_script(
            "Object.defineProperty(navigator,'webdriver',{get:()=>undefined});"
        )

        page = await context.new_page()
        try:
            await page.goto(UNSTOP_URL, wait_until="networkidle", timeout=45000)
        except Exception as exc:  # noqa: BLE001
            logger.warning("[unstop] page navigation failed: %s", exc)
            await context.close()
            await browser.close()
            return []

        # Some cookie / consent banners may block scroll.
        for sel in ("button:has-text('Accept')", "button:has-text('Got it')"):
            try:
                btn = await page.query_selector(sel)
                if btn:
                    await btn.click(timeout=2000)
            except Exception:
                pass

        last_count = 0
        stable_rounds = 0
        for i in range(MAX_SCROLLS):
            await page.evaluate("window.scrollTo(0, document.body.scrollHeight);")
            await asyncio.sleep(random.uniform(SCROLL_PAUSE_MIN, SCROLL_PAUSE_MAX))
            try:
                await page.wait_for_load_state("networkidle", timeout=4000)
            except Exception:
                pass
            try:
                items = await page.evaluate(_EXTRACT_JS)
            except Exception as exc:  # noqa: BLE001
                logger.warning("[unstop] extraction failed mid-scroll: %s", exc)
                items = []
            if len(items) == last_count:
                stable_rounds += 1
                if stable_rounds >= 2:
                    break
            else:
                stable_rounds = 0
                last_count = len(items)

        try:
            items = await page.evaluate(_EXTRACT_JS)
        except Exception as exc:  # noqa: BLE001
            logger.warning("[unstop] final extraction failed: %s", exc)
            items = []

        await context.close()
        await browser.close()

    seen_urls: set[str] = set()
    for item in items:
        url = (item.get("url") or "").strip()
        title = (item.get("title") or "").strip()
        if not title or not url or url in seen_urls:
            continue
        seen_urls.add(url)
        out.append(
            RawEvent(
                title=title,
                platform="unstop",
                url=url,
                image=item.get("image"),
                organizer=item.get("organizer"),
                tags=item.get("tags") or [],
                type="hackathon",
                mode="unknown",
            )
        )
    logger.info("[unstop] extracted %d events", len(out))
    return out


class UnstopScraper(BaseScraper):
    source = "unstop"

    async def scrape(self) -> Iterable[RawEvent]:
        return await _scrape_async()
