"""Unified raw event schema used by every scraper before normalization."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


@dataclass
class RawEvent:
    title: str = ""
    platform: str = ""
    url: str = ""
    image: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    location: Optional[str] = None
    mode: str = "unknown"  # online | offline | hybrid | unknown
    tags: list[str] = field(default_factory=list)
    organizer: Optional[str] = None
    type: str = "other"  # hackathon | webinar | workshop | other
    prize: Optional[str] = None
    description: Optional[str] = None
