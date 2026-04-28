import type { InsertEvent } from "@workspace/db";
import { fetchJsonWithRetry } from "../lib/fetchWithRetry";
import { logger } from "../lib/logger";
import { normalizeEvent, type RawEvent } from "../lib/normalize";
import { dedupeByUrl } from "../lib/validation";
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
  if (opp.public_url && opp.public_url.startsWith("https://"))
    return opp.public_url;
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
    const json = await fetchJsonWithRetry<UnstopResponse>(UNSTOP_API, {
      source: "unstop",
    });
    if (!json) return [];

    const items = json.data?.data ?? [];
    let invalidCount = 0;
    const events: InsertEvent[] = [];
    for (const item of items) {
      const raw = mapToRaw(item);
      if (!raw) {
        invalidCount++;
        continue;
      }
      const normalized = normalizeEvent(raw, "unstop");
      if (!normalized) {
        invalidCount++;
        continue;
      }
      events.push(normalized);
    }

    const { unique, duplicates } = dedupeByUrl(events);
    logger.info(
      {
        source: "unstop",
        rawCount: items.length,
        invalid: invalidCount,
        duplicatesRemoved: duplicates,
        finalCount: unique.length,
      },
      "Unstop scrape complete",
    );
    return unique;
  },
};
