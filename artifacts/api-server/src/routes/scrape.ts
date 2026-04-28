import { Router, type IRouter } from "express";
import { db, scrapeJobsTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import {
  ListScrapeJobsQueryParams,
  ListScrapeJobsResponse,
  TriggerScrapeBody,
  TriggerScrapeResponse,
} from "@workspace/api-zod";
import { runAllScrapers, runScraper } from "../lib/scraperRunner";

const router: IRouter = Router();

router.post("/scrape", async (req, res): Promise<void> => {
  const parsed = TriggerScrapeBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.message });
    return;
  }
  const source = parsed.data.source;

  req.log.info({ source }, "Manual scrape triggered");

  const jobs = source ? [await runScraper(source)] : await runAllScrapers();

  res.json(
    TriggerScrapeResponse.parse({
      jobs: jobs.map(serializeJob),
    }),
  );
});

router.get("/scrape/jobs", async (req, res): Promise<void> => {
  const parsed = ListScrapeJobsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.message });
    return;
  }

  const jobs = await db
    .select()
    .from(scrapeJobsTable)
    .orderBy(desc(scrapeJobsTable.startedAt))
    .limit(parsed.data.limit);

  res.json(
    ListScrapeJobsResponse.parse({
      jobs: jobs.map(serializeJob),
    }),
  );
});

function serializeJob(job: typeof scrapeJobsTable.$inferSelect) {
  return {
    id: job.id,
    source: job.source,
    status: job.status,
    eventsFound: job.eventsFound,
    eventsUpserted: job.eventsUpserted,
    errorMessage: job.errorMessage,
    startedAt: job.startedAt.toISOString(),
    finishedAt: job.finishedAt ? job.finishedAt.toISOString() : null,
  };
}

export default router;
