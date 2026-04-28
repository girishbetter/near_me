import { Router, type IRouter } from "express";
import { db, eventsTable } from "@workspace/db";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import {
  GetEventParams,
  GetEventResponse,
  ListEventsQueryParams,
  ListEventsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

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
