import type { Scraper } from "./types";
import { unstopScraper } from "./unstopScraper";
import { devpostScraper } from "./devpostScraper";
import { eventbriteScraper } from "./eventbriteScraper";

export const scrapers: Scraper[] = [
  unstopScraper,
  devpostScraper,
  eventbriteScraper,
];

export function findScraper(source: string): Scraper | undefined {
  return scrapers.find((s) => s.source === source);
}
