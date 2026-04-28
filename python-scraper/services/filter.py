"""Smart keyword filter — drop events that aren't tech/developer related."""
from __future__ import annotations

import re

KEYWORDS = (
    "hackathon",
    "hack ",
    "coding",
    "developer",
    " dev ",
    "devops",
    "engineer",
    "engineering",
    "programming",
    "ai ",
    " ai/",
    " ml ",
    "machine learning",
    "deep learning",
    "data scien",
    "tech",
    "software",
    "startup",
    "robotics",
    "blockchain",
    "web3",
    "cybersecurity",
    "open source",
    "cloud",
    "kubernetes",
    "fintech",
    "saas",
    "api",
    "frontend",
    "backend",
    "fullstack",
    "full-stack",
)

# Sources we trust unconditionally (they're already domain-specific).
TRUSTED_PLATFORMS = {"devpost", "devfolio", "unstop", "mlh", "hackerearth"}


def _haystack(row: dict) -> str:
    parts = [
        row.get("title") or "",
        row.get("description") or "",
        " ".join(row.get("tags") or []),
        row.get("organizer") or "",
    ]
    return " ".join(p.lower() for p in parts if p)


def is_tech_relevant(row: dict) -> bool:
    if (row.get("platform") or "") in TRUSTED_PLATFORMS:
        return True
    text = _haystack(row)
    if not text.strip():
        return False
    for kw in KEYWORDS:
        if kw in text:
            return True
    # Allow whole-word matches for a couple of short tokens that the
    # substring check above intentionally pads (`ai `, ` ml `).
    if re.search(r"\b(ai|ml|nlp|llm|web3)\b", text):
        return True
    return False


def filter_events(rows: list[dict]) -> tuple[list[dict], int]:
    kept = [r for r in rows if is_tech_relevant(r)]
    dropped = len(rows) - len(kept)
    return kept, dropped
