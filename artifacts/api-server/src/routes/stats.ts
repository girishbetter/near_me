import { Router, type IRouter } from "express";
import { db, eventsTable, scrapeJobsTable } from "@workspace/db";
import { and, asc, desc, gte, isNotNull, lte, sql } from "drizzle-orm";
import {
  GetStatsOverviewResponse,
  GetTrendingTagsQueryParams,
  GetTrendingTagsResponse,
  GetUpcomingDeadlinesQueryParams,
  GetUpcomingDeadlinesResponse,
} from "@workspace/api-zod";
import { serializeEvent } from "./events";

const router: IRouter = Router();

router.get("/stats/overview", async (_req, res): Promise<void> => {
  const totalRow = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(eventsTable);

  const byTypeRows = await db
    .select({
      type: eventsTable.type,
      count: sql<number>`count(*)::int`,
    })
    .from(eventsTable)
    .groupBy(eventsTable.type);

  const byPlatformRows = await db
    .select({
      platform: eventsTable.platform,
      count: sql<number>`count(*)::int`,
    })
    .from(eventsTable)
    .groupBy(eventsTable.platform);

  const byModeRows = await db
    .select({
      mode: eventsTable.mode,
      count: sql<number>`count(*)::int`,
    })
    .from(eventsTable)
    .groupBy(eventsTable.mode);

  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const upcomingRow = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(eventsTable)
    .where(
      and(
        isNotNull(eventsTable.endDate),
        gte(eventsTable.endDate, now),
        lte(eventsTable.endDate, weekFromNow),
      ),
    );

  const lastJob = await db
    .select({ finishedAt: scrapeJobsTable.finishedAt })
    .from(scrapeJobsTable)
    .where(isNotNull(scrapeJobsTable.finishedAt))
    .orderBy(desc(scrapeJobsTable.finishedAt))
    .limit(1);

  const counts: Record<string, number> = {};
  for (const r of byTypeRows) counts[r.type] = r.count;

  res.json(
    GetStatsOverviewResponse.parse({
      totalEvents: totalRow[0]?.count ?? 0,
      hackathons: counts.hackathon ?? 0,
      webinars: counts.webinar ?? 0,
      workshops: counts.workshop ?? 0,
      upcomingThisWeek: upcomingRow[0]?.count ?? 0,
      byPlatform: byPlatformRows,
      byType: byTypeRows,
      byMode: byModeRows,
      lastScrapedAt: lastJob[0]?.finishedAt
        ? lastJob[0].finishedAt.toISOString()
        : null,
    }),
  );
});

router.get("/stats/trending-tags", async (req, res): Promise<void> => {
  const parsed = GetTrendingTagsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.message });
    return;
  }
  const { limit } = parsed.data;

  const rows = await db.execute<{ tag: string; count: number }>(sql`
    SELECT tag, COUNT(*)::int AS count
    FROM ${eventsTable}, UNNEST(${eventsTable.tags}) AS tag
    GROUP BY tag
    ORDER BY count DESC
    LIMIT ${limit}
  `);

  res.json(
    GetTrendingTagsResponse.parse({
      tags: rows.rows.map((r) => ({ tag: r.tag, count: r.count })),
    }),
  );
});

router.get("/stats/upcoming-deadlines", async (req, res): Promise<void> => {
  const parsed = GetUpcomingDeadlinesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.message });
    return;
  }
  const { limit } = parsed.data;
  const now = new Date();

  const events = await db
    .select()
    .from(eventsTable)
    .where(and(isNotNull(eventsTable.endDate), gte(eventsTable.endDate, now)))
    .orderBy(asc(eventsTable.endDate))
    .limit(limit);

  const totalRow = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(eventsTable)
    .where(and(isNotNull(eventsTable.endDate), gte(eventsTable.endDate, now)));

  res.json(
    GetUpcomingDeadlinesResponse.parse({
      events: events.map(serializeEvent),
      total: totalRow[0]?.count ?? 0,
    }),
  );
});

export default router;
