"""Cross-source deduplication.

Primary key is URL (handled at the DB layer too). Secondary detection
uses Jaccard similarity on title tokens combined with date overlap.

When duplicates collide we keep the row from the highest-priority
source (see SOURCE_PRIORITY) and merge missing fields from the loser."""
from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Iterable

logger = logging.getLogger(__name__)

# Lower number = higher priority.
SOURCE_PRIORITY: dict[str, int] = {
    "devfolio": 1,
    "devpost": 2,
    "unstop": 3,
    "mlh": 4,
    "hackerearth": 5,
    "luma": 6,
    "eventbrite": 7,
}
DEFAULT_PRIORITY = 99

TITLE_SIMILARITY_THRESHOLD = 0.7
DATE_OVERLAP_WINDOW = timedelta(days=7)

_TOKEN_RE = re.compile(r"[a-z0-9]+")
_STOPWORDS = {
    "the", "a", "an", "of", "and", "or", "for", "with", "to", "in", "on",
    "at", "by", "from", "is", "are", "be", "hackathon", "hack", "challenge",
    "competition", "season", "edition", "vol", "v",
}


def priority(source: str) -> int:
    return SOURCE_PRIORITY.get(source, DEFAULT_PRIORITY)


def _tokens(title: str) -> set[str]:
    return {
        t for t in _TOKEN_RE.findall(title.lower())
        if t and t not in _STOPWORDS and len(t) > 1
    }


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    inter = len(a & b)
    union = len(a | b)
    return inter / union if union else 0.0


def _ensure_aware(d) -> datetime | None:
    """Coerce strings/datetimes/None into an aware UTC datetime."""
    if d is None:
        return None
    if isinstance(d, str):
        s = d.strip()
        if not s:
            return None
        # ISO 8601, including the trailing-Z form Postgres returns.
        try:
            d = datetime.fromisoformat(s.replace("Z", "+00:00"))
        except ValueError:
            return None
    if not isinstance(d, datetime):
        return None
    if d.tzinfo is None:
        return d.replace(tzinfo=timezone.utc)
    return d


def _date_overlap(a: dict, b: dict) -> bool:
    """True if the events look like they happen in the same window."""
    a_start = _ensure_aware(a.get("start_date"))
    a_end = _ensure_aware(a.get("end_date")) or a_start
    b_start = _ensure_aware(b.get("start_date"))
    b_end = _ensure_aware(b.get("end_date")) or b_start

    # If either side has no dates we can't disprove overlap; treat as plausible.
    if not (a_start or a_end) or not (b_start or b_end):
        return True

    a_start = a_start or a_end
    b_start = b_start or b_end
    if a_start is None or b_start is None:
        return True

    a_lo = a_start - DATE_OVERLAP_WINDOW
    a_hi = (a_end or a_start) + DATE_OVERLAP_WINDOW
    return not (b_end < a_lo or b_start > a_hi)


def _merge(winner: dict, loser: dict) -> dict:
    """Fill empty fields on winner using loser, keeping winner's identity."""
    merged = dict(winner)
    for key, value in loser.items():
        if key in ("platform", "url", "title"):
            continue
        if merged.get(key) in (None, "", []):
            merged[key] = value
    # Tags: union (cap 12).
    seen: set[str] = set()
    union: list[str] = []
    for t in (winner.get("tags") or []) + (loser.get("tags") or []):
        if not t or t.lower() in seen:
            continue
        seen.add(t.lower())
        union.append(t)
        if len(union) >= 12:
            break
    merged["tags"] = union
    return merged


def cross_source_dedupe(rows: Iterable[dict]) -> tuple[list[dict], int]:
    """Return (deduped_rows, removed_count)."""
    rows = list(rows)
    if not rows:
        return [], 0

    # Pre-tokenize titles for the similarity pass.
    enriched = [(row, _tokens(row.get("title") or "")) for row in rows]

    # Sort by priority so the iteration order is stable and the higher
    # priority row gets to "claim" a slot first.
    enriched.sort(key=lambda pair: priority(pair[0].get("platform") or ""))

    kept: list[tuple[dict, set[str]]] = []
    by_url: dict[str, int] = {}
    removed = 0
    for row, toks in enriched:
        url = row.get("url")
        if url and url in by_url:
            idx = by_url[url]
            kept[idx] = (_merge(kept[idx][0], row), kept[idx][1] | toks)
            removed += 1
            continue

        match_idx = -1
        for i, (existing, existing_toks) in enumerate(kept):
            if _jaccard(toks, existing_toks) >= TITLE_SIMILARITY_THRESHOLD and _date_overlap(existing, row):
                match_idx = i
                break

        if match_idx == -1:
            kept.append((row, toks))
            if url:
                by_url[url] = len(kept) - 1
        else:
            kept[match_idx] = (_merge(kept[match_idx][0], row), kept[match_idx][1] | toks)
            removed += 1

    return [r for r, _ in kept], removed
