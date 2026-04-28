import type { Scraper } from "./types";
import { unstopScraper } from "./unstopScraper";
import { devpostScraper } from "./devpostScraper";
import { devfolioScraper } from "./devfolioScraper";
import { eventbriteScraper } from "./eventbriteScraper";

export const scrapers: Scraper[] = [
  unstopScraper,
  devpostScraper,
  devfolioScraper,
  eventbriteScraper,
];

export function findScraper(source: string): Scraper | undefined {
  return scrapers.find((s) => s.source === source);
}
