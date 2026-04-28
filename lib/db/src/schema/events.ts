import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const eventsTable = pgTable(
  "events",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    platform: text("platform").notNull(),
    type: text("type").notNull(),
    url: text("url").notNull(),
    image: text("image"),
    startDate: timestamp("start_date", { withTimezone: true }),
    endDate: timestamp("end_date", { withTimezone: true }),
    mode: text("mode").notNull().default("unknown"),
    tags: text("tags").array().notNull().default([]),
    organizer: text("organizer"),
    location: text("location"),
    prize: text("prize"),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("events_url_unique").on(table.url),
    index("events_type_idx").on(table.type),
    index("events_platform_idx").on(table.platform),
    index("events_mode_idx").on(table.mode),
    index("events_end_date_idx").on(table.endDate),
  ],
);

export const insertEventSchema = createInsertSchema(eventsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof eventsTable.$inferSelect;

export const scrapeJobsTable = pgTable("scrape_jobs", {
  id: serial("id").primaryKey(),
  source: text("source").notNull(),
  status: text("status").notNull(),
  eventsFound: integer("events_found").notNull().default(0),
  eventsUpserted: integer("events_upserted").notNull().default(0),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const insertScrapeJobSchema = createInsertSchema(scrapeJobsTable).omit({
  id: true,
});
export type InsertScrapeJob = z.infer<typeof insertScrapeJobSchema>;
export type ScrapeJob = typeof scrapeJobsTable.$inferSelect;
