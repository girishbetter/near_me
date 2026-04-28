"""Abstract scraper interface. All concrete scrapers return a list of
RawEvent objects; normalization + persistence happens later."""
from __future__ import annotations

import abc
import logging
from typing import Iterable

from models.raw_event import RawEvent

logger = logging.getLogger(__name__)


class BaseScraper(abc.ABC):
    source: str = "unknown"

    async def safe_scrape(self) -> list[RawEvent]:
        try:
            logger.info("[%s] starting scrape", self.source)
            results = list(await self.scrape())
            logger.info(
                "[%s] finished scrape with %d raw events", self.source, len(results)
            )
            return results
        except Exception as exc:  # noqa: BLE001
            logger.exception("[%s] scrape failed: %s", self.source, exc)
            return []

    @abc.abstractmethod
    async def scrape(self) -> Iterable[RawEvent]:
        """Return an iterable of RawEvent. Implementations may be sync or
        async-friendly via `await asyncio.to_thread(...)`."""
        raise NotImplementedError


USER_AGENTS = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
]


def random_user_agent() -> str:
    import random
    return random.choice(USER_AGENTS)
