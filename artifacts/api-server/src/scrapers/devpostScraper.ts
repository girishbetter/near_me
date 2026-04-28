import type { InsertEvent } from "@workspace/db";
import { fetchJsonWithRetry } from "../lib/fetchWithRetry";
import { logger } from "../lib/logger";
import { normalizeEvent, type RawEvent } from "../lib/normalize";
import { dedupeByUrl } from "../lib/validation";
import type { Scraper } from "./types";

const DEVPOST_API =
  "https://devpost.com/api/hackathons?status[]=upcoming&status[]=open";

type DevpostHackathon = {
  id: number;
  title?: string;
  url?: string;
  thumbnail_url?: string;
  submission_period_dates?: string;
  open_state?: string;
  displayed_location?: { location?: string };
  themes?: Array<{ name?: string }>;
  prize_amount?: string;
  organization_name?: string;
};

type DevpostResponse = {
  hackathons?: DevpostHackathon[];
  meta?: { total_count?: number };
};

function stripHtml(value?: string | null): string | null {
  if (!value) return null;
  return value.replace(/<[^>]+>/g, "").trim() || null;
}

function inferMode(location?: string | null): string {
  if (!location) return "online";
  const v = location.toLowerCase();
  if (v.includes("online")) return "online";
  return "offline";
}

function mapToRaw(h: DevpostHackathon): RawEvent | null {
  if (!h.title || !h.url) return null;
  const location = h.displayed_location?.location;
  return {
    title: h.title,
    url: h.url,
    image: h.thumbnail_url ?? null,
    type: "hackathon",
    mode: inferMode(location),
    location: location ?? null,
    organizer: h.organization_name ?? null,
    prize: stripHtml(h.prize_amount),
    tags:
      h.themes
        ?.map((t) => t.name)
        .filter((n): n is string => typeof n === "string") ?? [],
    endDate: null,
    startDate: null,
  };
}

export const devpostScraper: Scraper = {
  source: "devpost",
  async scrape(): Promise<InsertEvent[]> {
    logger.info({ source: "devpost" }, "Starting Devpost scrape");
    const json = await fetchJsonWithRetry<DevpostResponse>(DEVPOST_API, {
      source: "devpost",
    });
    if (!json) return [];

    const items = json.hackathons ?? [];
    let invalidCount = 0;
    const events: InsertEvent[] = [];
    for (const item of items) {
      const raw = mapToRaw(item);
      if (!raw) {
        invalidCount++;
        continue;
      }
      const normalized = normalizeEvent(raw, "devpost");
      if (!normalized) {
        invalidCount++;
        continue;
      }
      events.push(normalized);
    }

    const { unique, duplicates } = dedupeByUrl(events);
    logger.info(
      {
        source: "devpost",
        rawCount: items.length,
        invalid: invalidCount,
        duplicatesRemoved: duplicates,
        finalCount: unique.length,
      },
      "Devpost scrape complete",
    );
    return unique;
  },
};
