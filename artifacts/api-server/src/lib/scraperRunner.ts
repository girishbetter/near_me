import { db, eventsTable, scrapeJobsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import type { InsertEvent, ScrapeJob } from "@workspace/db";
import { logger } from "./logger";
import { scrapers, findScraper } from "../scrapers";

async function upsertEvents(events: InsertEvent[]): Promise<number> {
  if (events.length === 0) return 0;
  const result = await db
    .insert(eventsTable)
    .values(events)
    .onConflictDoUpdate({
      target: eventsTable.url,
      set: {
        title: sql`excluded.title`,
        platform: sql`excluded.platform`,
        type: sql`excluded.type`,
        image: sql`excluded.image`,
        startDate: sql`excluded.start_date`,
        endDate: sql`excluded.end_date`,
        mode: sql`excluded.mode`,
        tags: sql`excluded.tags`,
        organizer: sql`excluded.organizer`,
        location: sql`excluded.location`,
        prize: sql`excluded.prize`,
        description: sql`excluded.description`,
        updatedAt: new Date(),
      },
    })
    .returning({ id: eventsTable.id });
  return result.length;
}

export async function runScraper(source: string): Promise<ScrapeJob> {
  const scraper = findScraper(source);
  const [job] = await db
    .insert(scrapeJobsTable)
    .values({ source, status: "running" })
    .returning();
  if (!job) {
    throw new Error("Failed to create scrape job");
  }

  if (!scraper) {
    const [updated] = await db
      .update(scrapeJobsTable)
      .set({
        status: "error",
        errorMessage: `Unknown scraper: ${source}`,
        finishedAt: new Date(),
      })
      .where(sql`id = ${job.id}`)
      .returning();
    return updated ?? job;
  }

  try {
    const events = await scraper.scrape();
    const upserted = await upsertEvents(events);
    const [updated] = await db
      .update(scrapeJobsTable)
      .set({
        status: "success",
        eventsFound: events.length,
        eventsUpserted: upserted,
        finishedAt: new Date(),
      })
      .where(sql`id = ${job.id}`)
      .returning();
    logger.info(
      { source, found: events.length, upserted },
      "Scrape job complete",
    );
    return updated ?? job;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, source }, "Scrape job failed");
    const [updated] = await db
      .update(scrapeJobsTable)
      .set({
        status: "error",
        errorMessage: message,
        finishedAt: new Date(),
      })
      .where(sql`id = ${job.id}`)
      .returning();
    return updated ?? job;
  }
}

export async function runAllScrapers(): Promise<ScrapeJob[]> {
  const results: ScrapeJob[] = [];
  // Run sequentially with small delay to be polite to source sites.
  for (const scraper of scrapers) {
    const job = await runScraper(scraper.source);
    results.push(job);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return results;
}
