import type { InsertEvent } from "@workspace/db";
import { logger } from "../lib/logger";
import type { Scraper } from "./types";

// Placeholder. Eventbrite's public scraping endpoints require auth and rate
// limiting. Wire up an actual scraper or API client when credentials become
// available.
export const eventbriteScraper: Scraper = {
  source: "eventbrite",
  async scrape(): Promise<InsertEvent[]> {
    logger.info(
      { source: "eventbrite" },
      "Eventbrite scraper is a placeholder; skipping",
    );
    return [];
  },
};
