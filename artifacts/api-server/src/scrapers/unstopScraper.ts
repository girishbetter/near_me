import type { InsertEvent } from "@workspace/db";
import { logger } from "../lib/logger";
import { normalizeEvent, type RawEvent } from "../lib/normalize";
import type { Scraper } from "./types";

const UNSTOP_API =
  "https://unstop.com/api/public/opportunity/search-result?opportunity=hackathons&per_page=40&oppstatus=open&page=1";

type UnstopOpportunity = {
  id: number;
  title?: string;
  public_url?: string;
  seo_url?: string;
  images?: { logo?: string; logoImage?: string };
  banner_mobile?: { image_url?: string };
  start_date?: string;
  end_date?: string;
  regnRequirements?: { end_regn_dt?: string };
  organisation?: { name?: string };
  region?: string;
  prizes?: Array<{ amount?: number; cash?: number; currency?: string }>;
  filters?: Array<{ name?: string; type?: string }>;
  type?: string;
};

type UnstopResponse = {
  data?: { data?: UnstopOpportunity[] };
};

function buildUrl(opp: UnstopOpportunity): string | null {
  if (opp.public_url) return opp.public_url;
  if (opp.seo_url) return `https://unstop.com/o/${opp.seo_url}`;
  return null;
}

function buildPrize(opp: UnstopOpportunity): string | null {
  const cash = opp.prizes?.[0]?.cash ?? opp.prizes?.[0]?.amount;
  if (!cash) return null;
  const currency = opp.prizes?.[0]?.currency ?? "INR";
  return `${currency} ${cash.toLocaleString()}`;
}

function buildTags(opp: UnstopOpportunity): string[] {
  const filters = opp.filters ?? [];
  const tags = filters
    .filter((f) => f.type === "category" || f.type === "skill" || !f.type)
    .map((f) => f.name)
    .filter((n): n is string => typeof n === "string" && n.length > 0);
  return Array.from(new Set(tags)).slice(0, 8);
}

function mapToRaw(opp: UnstopOpportunity): RawEvent | null {
  const url = buildUrl(opp);
  if (!url || !opp.title) return null;
  return {
    title: opp.title,
    url,
    image: opp.images?.logo ?? opp.images?.logoImage ?? null,
    startDate: opp.start_date ?? null,
    endDate: opp.end_date ?? opp.regnRequirements?.end_regn_dt ?? null,
    mode: opp.region ?? null,
    type: "hackathon",
    tags: buildTags(opp),
    organizer: opp.organisation?.name ?? null,
    location: null,
    prize: buildPrize(opp),
    description: null,
  };
}

export const unstopScraper: Scraper = {
  source: "unstop",
  async scrape(): Promise<InsertEvent[]> {
    logger.info({ source: "unstop" }, "Starting Unstop scrape");
    try {
      const response = await fetch(UNSTOP_API, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        logger.warn(
          { source: "unstop", status: response.status },
          "Unstop request failed",
        );
        return [];
      }
      const json = (await response.json()) as UnstopResponse;
      const items = json.data?.data ?? [];
      const events: InsertEvent[] = [];
      for (const item of items) {
        const raw = mapToRaw(item);
        if (!raw) continue;
        const normalized = normalizeEvent(raw, "unstop");
        if (normalized) events.push(normalized);
      }
      logger.info(
        { source: "unstop", count: events.length },
        "Unstop scrape complete",
      );
      return events;
    } catch (err) {
      logger.error({ err, source: "unstop" }, "Unstop scrape failed");
      return [];
    }
  },
};
