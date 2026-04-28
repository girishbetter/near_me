import { db, eventsTable, scrapeJobsTable } from "@workspace/db";
import { sql, and, or, isNull, eq, notLike } from "drizzle-orm";
import type { InsertEvent, ScrapeJob } from "@workspace/db";
import { logger } from "./logger";
import { scrapers, findScraper } from "../scrapers";
import {
  crossPlatformDedupe,
  type ScraperBatch,
} from "./crossPlatformDedupe";

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

export async function cleanupInvalidEvents(): Promise<number> {
  const deleted = await db
    .delete(eventsTable)
    .where(
      or(
        isNull(eventsTable.url),
        eq(eventsTable.url, ""),
        eq(eventsTable.url, "#"),
        notLike(eventsTable.url, "https://%"),
        isNull(eventsTable.title),
        eq(eventsTable.title, ""),
      ),
    )
    .returning({ id: eventsTable.id });
  if (deleted.length > 0) {
    logger.info(
      { removed: deleted.length },
      "Cleanup removed invalid events from database",
    );
  } else {
    logger.info("Cleanup: no invalid events found");
  }
  return deleted.length;
}

async function createJob(source: string): Promise<ScrapeJob> {
  const [job] = await db
    .insert(scrapeJobsTable)
    .values({ source, status: "running" })
    .returning();
  if (!job) throw new Error("Failed to create scrape job");
  return job;
}

async function finalizeJob(
  id: number,
  patch: Partial<ScrapeJob>,
): Promise<ScrapeJob | undefined> {
  const [updated] = await db
    .update(scrapeJobsTable)
    .set({ ...patch, finishedAt: new Date() })
    .where(eq(scrapeJobsTable.id, id))
    .returning();
  return updated;
}

export async function runScraper(source: string): Promise<ScrapeJob> {
  const scraper = findScraper(source);
  const job = await createJob(source);

  if (!scraper) {
    return (
      (await finalizeJob(job.id, {
        status: "error",
        errorMessage: `Unknown scraper: ${source}`,
      })) ?? job
    );
  }

  try {
    const events = await scraper.scrape();
    const upserted = await upsertEvents(events);
    const updated = await finalizeJob(job.id, {
      status: "success",
      eventsFound: events.length,
      eventsUpserted: upserted,
    });
    logger.info(
      { source, found: events.length, upserted },
      "Scrape job complete",
    );
    return updated ?? job;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, source }, "Scrape job failed");
    return (
      (await finalizeJob(job.id, {
        status: "error",
        errorMessage: message,
      })) ?? job
    );
  }
}

export async function runAllScrapers(): Promise<ScrapeJob[]> {
  logger.info(
    { sources: scrapers.map((s) => s.source) },
    "Starting full scrape run",
  );

  const startedJobs = await Promise.all(
    scrapers.map((scraper) => createJob(scraper.source)),
  );

  const settled = await Promise.allSettled(
    scrapers.map((scraper) => scraper.scrape()),
  );

  const batches: ScraperBatch[] = [];
  const errors = new Map<string, string>();

  for (let i = 0; i < scrapers.length; i++) {
    const scraper = scrapers[i];
    const result = settled[i];
    if (!scraper || !result) continue;
    if (result.status === "fulfilled") {
      batches.push({ source: scraper.source, events: result.value });
    } else {
      const message =
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason);
      errors.set(scraper.source, message);
      logger.error(
        { source: scraper.source, err: result.reason },
        "Scraper failed",
      );
    }
  }

  const totalBefore = batches.reduce((s, b) => s + b.events.length, 0);
  const dedupResult = crossPlatformDedupe(batches);
  logger.info(
    {
      totalBefore,
      crossPlatformDuplicates: dedupResult.duplicatesAcrossSources,
      finalCount: dedupResult.events.length,
    },
    "Cross-platform deduplication complete",
  );

  const upserted = await upsertEvents(dedupResult.events);

  const finalJobs: ScrapeJob[] = [];
  const upsertShare =
    dedupResult.events.length > 0 ? upserted / dedupResult.events.length : 0;

  for (let i = 0; i < scrapers.length; i++) {
    const scraper = scrapers[i];
    const job = startedJobs[i];
    if (!scraper || !job) continue;
    const errorMessage = errors.get(scraper.source);
    if (errorMessage) {
      const updated = await finalizeJob(job.id, {
        status: "error",
        errorMessage,
      });
      if (updated) finalJobs.push(updated);
      continue;
    }
    const batch = batches.find((b) => b.source === scraper.source);
    const found = batch?.events.length ?? 0;
    const updated = await finalizeJob(job.id, {
      status: "success",
      eventsFound: found,
      eventsUpserted: Math.round(found * upsertShare),
    });
    if (updated) finalJobs.push(updated);
  }

  logger.info(
    {
      jobs: finalJobs.length,
      success: finalJobs.filter((j) => j.status === "success").length,
      errors: finalJobs.filter((j) => j.status === "error").length,
      totalScraped: totalBefore,
      crossPlatformDuplicates: dedupResult.duplicatesAcrossSources,
      upserted,
    },
    "Full scrape run complete",
  );
  return finalJobs;
}
