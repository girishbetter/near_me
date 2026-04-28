import type { InsertEvent } from "@workspace/db";
import { fetchJsonWithRetry } from "../lib/fetchWithRetry";
import { logger } from "../lib/logger";
import { normalizeEvent, type RawEvent } from "../lib/normalize";
import { dedupeByUrl } from "../lib/validation";
import type { Scraper } from "./types";

const DEVFOLIO_API = "https://api.devfolio.co/api/search/hackathons";

type DevfolioPrize = {
  name?: string | null;
  desc?: string | null;
};

type DevfolioHackathonSetting = {
  logo?: string | null;
  reg_ends_at?: string | null;
  site?: string | null;
  subdomain?: string | null;
};

type DevfolioHit = {
  _source?: {
    name?: string | null;
    slug?: string | null;
    desc?: string | null;
    tagline?: string | null;
    starts_at?: string | null;
    ends_at?: string | null;
    is_online?: boolean | null;
    apply_mode?: string | null;
    location?: string | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
    cover_img?: string | null;
    hosted_by?: string | null;
    themes?: Array<{ name?: string }> | null;
    hashtags?: string[] | null;
    prizes?: DevfolioPrize[] | null;
    hackathon_setting?: DevfolioHackathonSetting | null;
    status?: string | null;
  };
};

type DevfolioResponse = {
  hits?: { hits?: DevfolioHit[] };
};

function buildUrl(source: NonNullable<DevfolioHit["_source"]>): string | null {
  const slug = source.slug ?? source.hackathon_setting?.subdomain;
  if (!slug) return null;
  return `https://${slug}.devfolio.co/`;
}

function buildLocation(source: NonNullable<DevfolioHit["_source"]>): string | null {
  if (source.location) return source.location;
  const parts = [source.city, source.state, source.country]
    .filter((p): p is string => typeof p === "string" && p.length > 0);
  return parts.length > 0 ? parts.join(", ") : null;
}

function buildMode(source: NonNullable<DevfolioHit["_source"]>): string {
  const mode = (source.apply_mode ?? "").toLowerCase();
  if (mode === "both") return "hybrid";
  if (mode === "offline" || mode === "in_person") return "offline";
  if (mode === "online") return "online";
  if (source.is_online === true) return "online";
  if (source.is_online === false) return "offline";
  return "online";
}

function buildTags(source: NonNullable<DevfolioHit["_source"]>): string[] {
  const themes = (source.themes ?? [])
    .map((t) => t?.name)
    .filter((n): n is string => typeof n === "string" && n.length > 0);
  const hashtags = (source.hashtags ?? []).filter(
    (t): t is string => typeof t === "string" && t.length > 0,
  );
  return Array.from(new Set([...themes, ...hashtags])).slice(0, 8);
}

function buildPrize(source: NonNullable<DevfolioHit["_source"]>): string | null {
  const first = source.prizes?.[0];
  if (!first) return null;
  if (first.name && first.desc) return `${first.name}: ${first.desc}`;
  return first.name ?? first.desc ?? null;
}

function mapToRaw(hit: DevfolioHit): RawEvent | null {
  const source = hit._source;
  if (!source) return null;
  if (!source.name) return null;
  const url = buildUrl(source);
  if (!url) return null;
  return {
    title: source.name,
    url,
    image: source.cover_img ?? source.hackathon_setting?.logo ?? null,
    startDate: source.starts_at ?? null,
    endDate:
      source.ends_at ?? source.hackathon_setting?.reg_ends_at ?? null,
    mode: buildMode(source),
    type: "hackathon",
    tags: buildTags(source),
    organizer: source.hosted_by ?? null,
    location: buildLocation(source),
    prize: buildPrize(source),
    description: source.desc ?? source.tagline ?? null,
  };
}

export const devfolioScraper: Scraper = {
  source: "devfolio",
  async scrape(): Promise<InsertEvent[]> {
    logger.info({ source: "devfolio" }, "Starting Devfolio scrape");
    const json = await fetchJsonWithRetry<DevfolioResponse>(DEVFOLIO_API, {
      source: "devfolio",
      headers: { "Content-Type": "application/json" },
    }, {
      method: "POST",
      body: JSON.stringify({
        hitsPerPage: 50,
        filters: { status: ["OPEN"] },
        sort: "open",
      }),
    });
    if (!json) return [];

    const items = json.hits?.hits ?? [];
    let invalidCount = 0;
    const events: InsertEvent[] = [];
    for (const item of items) {
      const raw = mapToRaw(item);
      if (!raw) {
        invalidCount++;
        continue;
      }
      const normalized = normalizeEvent(raw, "devfolio");
      if (!normalized) {
        invalidCount++;
        continue;
      }
      events.push(normalized);
    }

    const { unique, duplicates } = dedupeByUrl(events);
    logger.info(
      {
        source: "devfolio",
        rawCount: items.length,
        invalid: invalidCount,
        duplicatesRemoved: duplicates,
        finalCount: unique.length,
      },
      "Devfolio scrape complete",
    );
    return unique;
  },
};
