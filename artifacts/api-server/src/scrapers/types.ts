import type { InsertEvent } from "@workspace/db";

export interface Scraper {
  source: string;
  scrape(): Promise<InsertEvent[]>;
}
