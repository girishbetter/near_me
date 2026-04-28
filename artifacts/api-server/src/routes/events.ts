import { Router, type IRouter } from "express";
import { db, eventsTable, type InsertEvent } from "@workspace/db";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import {
  CreateEventBody,
  GetEventParams,
  GetEventResponse,
  ListEventsQueryParams,
  ListEventsResponse,
} from "@workspace/api-zod";
import { isValidUrl } from "../lib/validation";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.post("/events", async (req, res): Promise<void> => {
  const parsed = CreateEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.message });
    return;
  }

  const data = parsed.data;
  if (!isValidUrl(data.url)) {
    res
      .status(400)
      .json({ message: "URL must start with https:// and be a valid link" });
    return;
  }

  const startDate = data.startDate ? new Date(data.startDate) : null;
  const endDate = data.endDate ? new Date(data.endDate) : null;
  if (startDate && Number.isNaN(startDate.getTime())) {
    res.status(400).json({ message: "Invalid startDate" });
    return;
  }
  if (endDate && Number.isNaN(endDate.getTime())) {
    res.status(400).json({ message: "Invalid endDate" });
    return;
  }

  const tags = Array.from(
    new Set(
      (data.tags ?? [])
        .map((t) => t.trim())
        .filter((t) => t.length > 0 && t.length < 60),
    ),
  ).slice(0, 12);

  const insertValue: InsertEvent = {
    title: data.title.trim().slice(0, 500),
    platform: "manual",
    type: data.type,
    url: data.url.trim(),
    image: data.image?.trim() || null,
    startDate,
    endDate,
    mode: data.mode,
    tags,
    organizer: data.organizer?.trim() || null,
    location: data.location?.trim() || null,
    prize: data.prize?.trim() || null,
    description: data.description?.trim() || null,
  };

  try {
    const [created] = await db
      .insert(eventsTable)
      .values(insertValue)
      .returning();
    if (!created) {
      res.status(500).json({ message: "Failed to create event" });
      return;
    }
    logger.info({ id: created.id, url: created.url }, "Manual event created");
    res.status(201).json(GetEventResponse.parse(serializeEvent(created)));
  } catch (err) {
    const code = (err as { code?: string; cause?: { code?: string } })?.code ??
      (err as { cause?: { code?: string } })?.cause?.code;
    const message = err instanceof Error ? err.message : String(err);
    if (
      code === "23505" ||
      /duplicate key|unique constraint/i.test(message)
    ) {
      res
        .status(409)
        .json({ message: "An event with this URL already exists" });
      return;
    }
    logger.error({ err }, "Failed to create event");
    res.status(500).json({ message: "Failed to create event" });
  }
});

router.get("/events", async (req, res): Promise<void> => {
  const parsed = ListEventsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.message });
    return;
  }

  const { type, platform, mode, tag, search, limit, offset } = parsed.data;

  const conditions = [];
  if (type && type !== "all") conditions.push(eq(eventsTable.type, type));
  if (platform) conditions.push(eq(eventsTable.platform, platform));
  if (mode && mode !== "all") conditions.push(eq(eventsTable.mode, mode));
  if (tag) {
    conditions.push(sql`${tag} = ANY(${eventsTable.tags})`);
  }
  if (search) {
    const term = `%${search}%`;
    const titleMatch = ilike(eventsTable.title, term);
    const orgMatch = ilike(eventsTable.organizer, term);
    const orCondition = or(titleMatch, orgMatch);
    if (orCondition) conditions.push(orCondition);
  }

  const where =
    conditions.length === 0
      ? undefined
      : conditions.length === 1
        ? conditions[0]
        : and(...conditions);

  const baseQuery = where
    ? db.select().from(eventsTable).where(where)
    : db.select().from(eventsTable);

  const events = await baseQuery
    .orderBy(
      sql`CASE WHEN ${eventsTable.endDate} IS NULL THEN 1 ELSE 0 END`,
      asc(eventsTable.endDate),
      desc(eventsTable.createdAt),
    )
    .limit(limit)
    .offset(offset);

  const totalQuery = where
    ? db
        .select({ count: sql<number>`count(*)::int` })
        .from(eventsTable)
        .where(where)
    : db.select({ count: sql<number>`count(*)::int` }).from(eventsTable);

  const [totalRow] = await totalQuery;
  const total = totalRow?.count ?? 0;

  res.json(
    ListEventsResponse.parse({
      events: events.map(serializeEvent),
      total,
    }),
  );
});

router.get("/events/:id", async (req, res): Promise<void> => {
  const params = GetEventParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }

  const [event] = await db
    .select()
    .from(eventsTable)
    .where(eq(eventsTable.id, params.data.id));

  if (!event) {
    res.status(404).json({ message: "Event not found" });
    return;
  }

  res.json(GetEventResponse.parse(serializeEvent(event)));
});

function serializeEvent(event: typeof eventsTable.$inferSelect) {
  return {
    id: event.id,
    title: event.title,
    platform: event.platform,
    type: event.type,
    url: event.url,
    image: event.image,
    startDate: event.startDate ? event.startDate.toISOString() : null,
    endDate: event.endDate ? event.endDate.toISOString() : null,
    mode: event.mode,
    tags: event.tags ?? [],
    organizer: event.organizer,
    location: event.location,
    prize: event.prize,
    description: event.description,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  };
}

export { serializeEvent };
export default router;
