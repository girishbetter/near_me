import type { InsertEvent } from "@workspace/db";
import { logger } from "./logger";

const DATE_OVERLAP_DAYS = 7;
const TITLE_SIMILARITY_THRESHOLD = 0.7;
const STOP_TOKENS = new Set([
  "the",
  "a",
  "an",
  "of",
  "and",
  "for",
  "to",
  "by",
  "in",
  "on",
  "at",
  "with",
  "hackathon",
  "competition",
  "challenge",
  "event",
  "contest",
  "summit",
  "conference",
]);

export type ScraperBatch = {
  source: string;
  events: InsertEvent[];
};

function normalizeTitle(title: string): Set<string> {
  const cleaned = title
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const tokens = cleaned
    .split(/\s+/)
    .map((t) => t.replace(/^\d+(st|nd|rd|th)?$/i, ""))
    .filter((t) => t.length > 1 && !STOP_TOKENS.has(t));
  return new Set(tokens);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const v of a) if (b.has(v)) intersection++;
  const union = a.size + b.size - intersection;
  if (union === 0) return 0;
  return intersection / union;
}

function dateProximity(a: InsertEvent, b: InsertEvent): boolean {
  const aDates = [a.startDate, a.endDate].filter(
    (d): d is Date => d instanceof Date,
  );
  const bDates = [b.startDate, b.endDate].filter(
    (d): d is Date => d instanceof Date,
  );
  if (aDates.length === 0 || bDates.length === 0) {
    return true;
  }
  const windowMs = DATE_OVERLAP_DAYS * 24 * 60 * 60 * 1000;
  for (const ad of aDates) {
    for (const bd of bDates) {
      if (Math.abs(ad.getTime() - bd.getTime()) <= windowMs) {
        return true;
      }
    }
  }
  return false;
}

function completenessScore(event: InsertEvent): number {
  let score = 0;
  if (event.image) score++;
  if (event.startDate) score++;
  if (event.endDate) score++;
  if (event.organizer) score++;
  if (event.location) score++;
  if (event.prize) score++;
  if (event.description) score++;
  if (event.tags && event.tags.length > 0) score += event.tags.length;
  return score;
}

export function crossPlatformDedupe(batches: ScraperBatch[]): {
  events: InsertEvent[];
  totalIn: number;
  duplicatesAcrossSources: number;
} {
  const flat: Array<InsertEvent & { _src: string; _key: Set<string> }> = [];
  for (const batch of batches) {
    for (const event of batch.events) {
      flat.push({
        ...event,
        _src: batch.source,
        _key: normalizeTitle(event.title),
      });
    }
  }

  const totalIn = flat.length;
  const kept: typeof flat = [];

  for (const candidate of flat) {
    let mergedIndex = -1;
    for (let i = 0; i < kept.length; i++) {
      const existing = kept[i];
      if (!existing) continue;
      if (existing._src === candidate._src) continue;
      const similarity = jaccard(existing._key, candidate._key);
      if (similarity < TITLE_SIMILARITY_THRESHOLD) continue;
      if (!dateProximity(existing, candidate)) continue;
      mergedIndex = i;
      break;
    }
    if (mergedIndex === -1) {
      kept.push(candidate);
      continue;
    }
    const existing = kept[mergedIndex];
    if (!existing) {
      kept.push(candidate);
      continue;
    }
    if (completenessScore(candidate) > completenessScore(existing)) {
      logger.info(
        {
          keptSource: candidate._src,
          droppedSource: existing._src,
          keptTitle: candidate.title,
          droppedTitle: existing.title,
        },
        "Cross-platform duplicate: replaced existing with more complete record",
      );
      kept[mergedIndex] = candidate;
    } else {
      logger.info(
        {
          keptSource: existing._src,
          droppedSource: candidate._src,
          keptTitle: existing.title,
          droppedTitle: candidate.title,
        },
        "Cross-platform duplicate: dropped less complete record",
      );
    }
  }

  const events = kept.map((entry) => {
    const { _src: _src, _key: _key, ...rest } = entry;
    void _src;
    void _key;
    return rest as InsertEvent;
  });

  return {
    events,
    totalIn,
    duplicatesAcrossSources: totalIn - events.length,
  };
}
