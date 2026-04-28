import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  doublePrecision,
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
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
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
    index("events_coords_idx").on(table.latitude, table.longitude),
  ],
);

/**
 * Geocode cache — keyed by the raw `location` string we feed to
 * Nominatim. We never call the Nominatim API twice for the same
 * location string thanks to this table.
 */
export const geocodeCacheTable = pgTable(
  "geocode_cache",
  {
    id: serial("id").primaryKey(),
    location: text("location").notNull(),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    /** Raw Nominatim display_name; useful for debugging miss vs. hit. */
    displayName: text("display_name"),
    /** Set when the API returned no result, so we don't keep re-asking. */
    notFound: integer("not_found").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("geocode_cache_location_unique").on(table.location)],
);

export type GeocodeCacheRow = typeof geocodeCacheTable.$inferSelect;

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
