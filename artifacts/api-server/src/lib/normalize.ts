import type { InsertEvent } from "@workspace/db";

export type RawEvent = {
  title?: string | null;
  url?: string | null;
  image?: string | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  deadline?: string | Date | null;
  mode?: string | null;
  type?: string | null;
  tags?: string[] | null;
  organizer?: string | null;
  location?: string | null;
  prize?: string | null;
  description?: string | null;
};

const KNOWN_TYPES = new Set(["hackathon", "webinar", "workshop"]);
const KNOWN_MODES = new Set(["online", "offline", "hybrid"]);

function parseDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (!Number.isNaN(d.getTime())) return d;
  return null;
}

function normalizeType(value?: string | null): InsertEvent["type"] {
  const v = (value ?? "").toLowerCase().trim();
  if (KNOWN_TYPES.has(v)) return v;
  if (v.includes("hack")) return "hackathon";
  if (v.includes("webinar")) return "webinar";
  if (v.includes("workshop")) return "workshop";
  return "other";
}

function normalizeMode(value?: string | null): InsertEvent["mode"] {
  const v = (value ?? "").toLowerCase().trim();
  if (KNOWN_MODES.has(v)) return v;
  if (v.includes("online") || v.includes("virtual") || v.includes("remote"))
    return "online";
  if (v.includes("offline") || v.includes("in-person") || v.includes("onsite"))
    return "offline";
  if (v.includes("hybrid")) return "hybrid";
  return "unknown";
}

export function normalizeEvent(
  raw: RawEvent,
  source: string,
): InsertEvent | null {
  const title = raw.title?.trim();
  const url = raw.url?.trim();
  if (!title || !url) return null;

  const end = parseDate(raw.endDate ?? raw.deadline);
  const start = parseDate(raw.startDate);

  const tags = (raw.tags ?? [])
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && t.length < 60)
    .slice(0, 12);

  return {
    title: title.slice(0, 500),
    platform: source,
    type: normalizeType(raw.type),
    url,
    image: raw.image?.trim() || null,
    startDate: start,
    endDate: end,
    mode: normalizeMode(raw.mode),
    tags,
    organizer: raw.organizer?.trim() || null,
    location: raw.location?.trim() || null,
    prize: raw.prize?.trim() || null,
    description: raw.description?.trim() || null,
  };
}
