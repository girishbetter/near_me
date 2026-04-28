import type { InsertEvent } from "@workspace/db";
import { logger } from "../lib/logger";
import { normalizeEvent, type RawEvent } from "../lib/normalize";
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
    try {
      const response = await fetch(DEVPOST_API, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        logger.warn(
          { source: "devpost", status: response.status },
          "Devpost request failed",
        );
        return [];
      }
      const json = (await response.json()) as DevpostResponse;
      const items = json.hackathons ?? [];
      const events: InsertEvent[] = [];
      for (const item of items) {
        const raw = mapToRaw(item);
        if (!raw) continue;
        const normalized = normalizeEvent(raw, "devpost");
        if (normalized) events.push(normalized);
      }
      logger.info(
        { source: "devpost", count: events.length },
        "Devpost scrape complete",
      );
      return events;
    } catch (err) {
      logger.error({ err, source: "devpost" }, "Devpost scrape failed");
      return [];
    }
  },
};
