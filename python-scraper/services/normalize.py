"""Cleaning + normalization helpers. Mirrors normalizeEvent() from the
Node backend so both services produce compatible rows."""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Iterable, Optional
from urllib.parse import urlparse

from models.raw_event import RawEvent

KNOWN_TYPES = {"hackathon", "webinar", "workshop"}
KNOWN_MODES = {"online", "offline", "hybrid"}


def parse_date(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value
    if isinstance(value, (int, float)):
        # Heuristic: treat as ms if it's clearly milliseconds
        try:
            ts = float(value)
            if ts > 1e12:
                ts = ts / 1000.0
            return datetime.fromtimestamp(ts, tz=timezone.utc)
        except (OverflowError, ValueError, OSError):
            return None
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return None
        # Try ISO 8601 first
        try:
            # Handle trailing Z
            iso = s.replace("Z", "+00:00")
            dt = datetime.fromisoformat(iso)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except ValueError:
            pass
        # Try a few common formats
        for fmt in (
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%d",
            "%d %b %Y",
            "%d %B %Y",
            "%b %d, %Y",
            "%B %d, %Y",
        ):
            try:
                dt = datetime.strptime(s, fmt)
                return dt.replace(tzinfo=timezone.utc)
            except ValueError:
                continue
    return None


def normalize_type(value: Optional[str]) -> str:
    v = (value or "").lower().strip()
    if v in KNOWN_TYPES:
        return v
    if "hack" in v:
        return "hackathon"
    if "webinar" in v:
        return "webinar"
    if "workshop" in v:
        return "workshop"
    return "other"


def normalize_mode(value: Optional[str]) -> str:
    v = (value or "").lower().strip()
    if v in KNOWN_MODES:
        return v
    if any(k in v for k in ("online", "virtual", "remote")):
        return "online"
    if any(k in v for k in ("offline", "in-person", "in person", "onsite", "on-site")):
        return "offline"
    if "hybrid" in v:
        return "hybrid"
    return "unknown"


def is_valid_url(url: Optional[str]) -> bool:
    if not url:
        return False
    try:
        parsed = urlparse(url)
        return parsed.scheme in ("http", "https") and bool(parsed.netloc)
    except Exception:
        return False


def clean_tags(tags: Optional[Iterable[str]]) -> list[str]:
    if not tags:
        return []
    seen: dict[str, None] = {}
    for t in tags:
        if not isinstance(t, str):
            continue
        s = re.sub(r"\s+", " ", t).strip()
        if 0 < len(s) < 60 and s.lower() not in seen:
            seen[s.lower()] = None
            if len(seen) >= 12:
                break
    return [k for k in seen.keys()]


def normalize_event(raw: RawEvent, source: str) -> Optional[dict]:
    title = (raw.title or "").strip()
    url = (raw.url or "").strip()
    if not title or not is_valid_url(url):
        return None

    end = parse_date(raw.end_date)
    start = parse_date(raw.start_date)

    return {
        "title": title[:500],
        "platform": source,
        "type": normalize_type(raw.type),
        "url": url,
        "image": (raw.image or "").strip() or None,
        "start_date": start,
        "end_date": end,
        "mode": normalize_mode(raw.mode),
        "tags": clean_tags(raw.tags),
        "organizer": (raw.organizer or "").strip() or None,
        "location": (raw.location or "").strip() or None,
        "prize": (raw.prize or "").strip() or None,
        "description": (raw.description or "").strip() or None,
    }
