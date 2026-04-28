"""Unstop competition scraper.

Unstop is a heavy React SPA whose listings come from a JSON API rather
than from server-rendered HTML. Scraping the rendered DOM is fragile,
so the primary strategy is **network interception**: we drive a real
Chromium via Playwright, watch every XHR/fetch response, and pull the
opportunity list straight out of the JSON the page itself consumes.

If interception comes up empty (e.g. the API path moves), we fall back
to a plain HTTP GET against the known endpoint, and finally to DOM
scraping with stable selectors."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import random
from typing import Any, Iterable
from urllib.parse import urlencode

import httpx

from models.raw_event import RawEvent
from scrapers.base import BaseScraper, random_user_agent

logger = logging.getLogger(__name__)

PAGE_URL = "https://unstop.com/competitions?oppstatus=open"
API_BASE = "https://unstop.com/api/public/opportunity/search-result"

MAX_API_PAGES = 4
MAX_SCROLLS = 12
NAV_TIMEOUT_MS = 45_000
SCROLL_PAUSE_MIN = 0.7
SCROLL_PAUSE_MAX = 1.5
HEADLESS = os.getenv("UNSTOP_HEADLESS", "1") != "0"


def _entry_to_raw(item: dict) -> RawEvent | None:
    """Translate a single Unstop API result row into a RawEvent."""
    title = (item.get("title") or item.get("name") or "").strip()
    if not title:
        return None

    # Build a public URL. The API gives us `public_url` or `seo_url`.
    public = item.get("public_url") or item.get("seo_url") or item.get("url")
    if not public:
        slug = item.get("slug") or item.get("permalink")
        if slug:
            public = f"https://unstop.com/o/{slug}"
    if not public:
        return None
    if isinstance(public, str) and not public.startswith("http"):
        # Unstop's API returns paths like 'hackathons/foo-1234' OR '/o/foo'.
        public = "https://unstop.com/" + public.lstrip("/")

    organizer = None
    org = item.get("organisation") or item.get("organisation_name") or item.get("organisation_details")
    if isinstance(org, dict):
        organizer = org.get("name")
    elif isinstance(org, str):
        organizer = org

    image = item.get("logoUrl2") or item.get("logoUrl") or item.get("banner_mobile") or item.get("banner")
    if isinstance(image, dict):
        image = image.get("image_url") or image.get("url")

    end_date = (
        item.get("end_date")
        or item.get("regnRequirements", {}).get("end_regn_dt") if isinstance(item.get("regnRequirements"), dict) else None
    ) or item.get("end_dt") or item.get("registrationEndDate")
    start_date = item.get("start_date") or item.get("start_dt")

    region = (item.get("region") or "").lower() if isinstance(item.get("region"), str) else ""
    if region in ("online", "virtual"):
        mode = "online"
    elif region == "offline":
        mode = "offline"
    elif region == "hybrid":
        mode = "hybrid"
    else:
        mode = "unknown"

    location = None
    locs = item.get("locations") or item.get("city")
    if isinstance(locs, list) and locs:
        location = ", ".join(str(x) for x in locs if x)
    elif isinstance(locs, str):
        location = locs

    tags: list[str] = []
    for key in ("filters", "categories", "categoryNames", "skills"):
        v = item.get(key)
        if isinstance(v, list):
            for entry in v:
                if isinstance(entry, dict):
                    name = entry.get("name") or entry.get("title")
                else:
                    name = str(entry)
                if name:
                    tags.append(name)

    prize = None
    prizes = item.get("prizes") or item.get("prize_amount")
    if isinstance(prizes, list) and prizes:
        first = prizes[0]
        if isinstance(first, dict):
            prize = first.get("cash") or first.get("title") or first.get("name")
        else:
            prize = str(first)
    elif isinstance(prizes, (int, str)):
        prize = str(prizes)

    return RawEvent(
        title=title,
        platform="unstop",
        url=public,
        image=image if isinstance(image, str) else None,
        start_date=start_date,
        end_date=end_date,
        mode=mode,
        tags=tags,
        organizer=organizer,
        location=location,
        type=("hackathon" if "hack" in title.lower() else "other"),
        prize=str(prize) if prize is not None else None,
    )


def _looks_like_search_response(url: str) -> bool:
    return "search-result" in url or "opportunity/search" in url or "search?type=" in url


def _extract_items(payload: Any) -> list[dict]:
    """Pull the opportunity list out of one of several shapes Unstop has used."""
    if not isinstance(payload, dict):
        return []
    if isinstance(payload.get("data"), dict):
        d = payload["data"]
        for key in ("data", "results", "opportunities"):
            v = d.get(key)
            if isinstance(v, list):
                return v
    for key in ("data", "results", "opportunities"):
        v = payload.get(key)
        if isinstance(v, list):
            return v
    return []


async def _try_direct_api() -> list[RawEvent]:
    """Hit the public search API directly. Works often enough that we try it
    before paying the cost of launching a browser."""
    out: list[RawEvent] = []
    seen: set[str] = set()
    headers = {
        "User-Agent": random_user_agent(),
        "Accept": "application/json, text/plain, */*",
        "Referer": "https://unstop.com/competitions?oppstatus=open",
    }
    async with httpx.AsyncClient(headers=headers, timeout=20.0) as client:
        for page in range(1, MAX_API_PAGES + 1):
            params = {
                "opportunity": "competitions",
                "page": page,
                "per_page": 30,
                "oppstatus": "open",
            }
            try:
                r = await client.get(f"{API_BASE}?{urlencode(params)}")
                if r.status_code != 200:
                    logger.info("[unstop] direct api page=%s status=%s", page, r.status_code)
                    break
                payload = r.json()
            except Exception as exc:  # noqa: BLE001
                logger.info("[unstop] direct api page=%s failed: %s", page, exc)
                break
            items = _extract_items(payload)
            if not items:
                break
            new = 0
            for it in items:
                ev = _entry_to_raw(it)
                if not ev or ev.url in seen:
                    continue
                seen.add(ev.url)
                out.append(ev)
                new += 1
            if new == 0:
                break
            await asyncio.sleep(0.3)
    logger.info("[unstop] direct api yielded %d events", len(out))
    return out


_FALLBACK_DOM_JS = r"""
() => {
  const cards = Array.from(document.querySelectorAll(
    'app-competition-listing app-opportunity-card, app-opportunity-card, [data-testid="opportunity-card"], a[href*="/o/"], a[href*="/p/"]'
  ));
  const seen = new Set();
  const out = [];
  for (const c of cards) {
    const a = c.tagName === 'A' ? c : c.querySelector('a[href]');
    const href = a ? a.href : null;
    if (!href || seen.has(href)) continue;
    if (!/\/(o|p)\//.test(href)) continue;
    seen.add(href);
    const titleEl = c.querySelector('h2, h3, [class*="title" i]');
    const orgEl = c.querySelector('[class*="organi" i], [class*="company" i]');
    const imgEl = c.querySelector('img');
    out.push({
      title: titleEl ? titleEl.textContent.trim() : (a.textContent || '').trim().slice(0, 200),
      url: href,
      organizer: orgEl ? orgEl.textContent.trim() : null,
      image: imgEl ? imgEl.src : null,
    });
  }
  return out;
}
"""


async def _scrape_with_browser() -> list[RawEvent]:
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        logger.warning("[unstop] playwright not installed; skipping browser path")
        return []

    captured_payloads: list[Any] = []

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
        await context.add_init_script(
            "Object.defineProperty(navigator,'webdriver',{get:()=>undefined});"
        )
        page = await context.new_page()

        async def _on_response(response):
            try:
                if response.request.resource_type not in ("xhr", "fetch"):
                    return
                if not _looks_like_search_response(response.url):
                    return
                if response.status != 200:
                    return
                try:
                    body = await response.json()
                except Exception:
                    txt = await response.text()
                    try:
                        body = json.loads(txt)
                    except Exception:
                        return
                items = _extract_items(body)
                if items:
                    captured_payloads.append(items)
                    logger.info(
                        "[unstop] intercepted %d items from %s",
                        len(items),
                        response.url[:120],
                    )
            except Exception:  # noqa: BLE001
                pass

        page.on("response", _on_response)

        try:
            await page.goto(PAGE_URL, wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS)
            try:
                await page.wait_for_load_state("networkidle", timeout=15_000)
            except Exception:
                pass
        except Exception as exc:  # noqa: BLE001
            logger.warning("[unstop] navigation failed: %s", exc)
            await context.close()
            await browser.close()
            return []

        # Some accept banners may block scroll.
        for sel in ("button:has-text('Accept')", "button:has-text('Got it')"):
            try:
                btn = await page.query_selector(sel)
                if btn:
                    await btn.click(timeout=2000)
            except Exception:
                pass

        # Trigger lazy-load by scrolling. Each scroll usually fires an XHR
        # which our listener captures.
        last_count = 0
        stable = 0
        for _ in range(MAX_SCROLLS):
            await page.evaluate("window.scrollBy(0, document.body.scrollHeight);")
            await asyncio.sleep(random.uniform(SCROLL_PAUSE_MIN, SCROLL_PAUSE_MAX))
            try:
                await page.wait_for_load_state("networkidle", timeout=4000)
            except Exception:
                pass
            total = sum(len(p) for p in captured_payloads)
            if total == last_count:
                stable += 1
                if stable >= 2:
                    break
            else:
                stable = 0
                last_count = total

        # Fallback: pull DOM cards if nothing was intercepted.
        dom_items: list[dict] = []
        if not captured_payloads:
            try:
                dom_items = await page.evaluate(_FALLBACK_DOM_JS)
                logger.info("[unstop] DOM fallback found %d cards", len(dom_items))
            except Exception as exc:  # noqa: BLE001
                logger.warning("[unstop] DOM fallback failed: %s", exc)

            if not dom_items:
                # Snapshot for debugging.
                try:
                    await page.screenshot(path="/tmp/unstop-debug.png", full_page=False)
                    body_len = await page.evaluate("document.body.innerText.length")
                    logger.warning(
                        "[unstop] no items after scroll; body=%d chars; screenshot=/tmp/unstop-debug.png",
                        body_len,
                    )
                except Exception:
                    pass

        await context.close()
        await browser.close()

    out: list[RawEvent] = []
    seen: set[str] = set()
    for payload in captured_payloads:
        for item in payload:
            ev = _entry_to_raw(item)
            if not ev or ev.url in seen:
                continue
            seen.add(ev.url)
            out.append(ev)

    if not out:
        for item in dom_items:  # type: ignore[possibly-undefined]
            url = (item.get("url") or "").strip()
            title = (item.get("title") or "").strip()
            if not title or not url or url in seen:
                continue
            seen.add(url)
            out.append(
                RawEvent(
                    title=title,
                    platform="unstop",
                    url=url,
                    image=item.get("image"),
                    organizer=item.get("organizer"),
                    type="hackathon" if "hack" in title.lower() else "other",
                    mode="unknown",
                )
            )
    return out


class UnstopScraper(BaseScraper):
    source = "unstop"

    async def scrape(self) -> Iterable[RawEvent]:
        # Prefer the lightweight direct API.
        try:
            api_results = await _try_direct_api()
        except Exception as exc:  # noqa: BLE001
            logger.warning("[unstop] direct api errored: %s", exc)
            api_results = []
        if len(api_results) >= 5:
            return api_results

        # Otherwise drive a browser and intercept the same call.
        browser_results = await _scrape_with_browser()
        # Merge whatever we have.
        seen: set[str] = set()
        merged: list[RawEvent] = []
        for ev in (*api_results, *browser_results):
            if ev.url in seen:
                continue
            seen.add(ev.url)
            merged.append(ev)
        if not merged:
            logger.error("[unstop] returned 0 events from all strategies")
        return merged
