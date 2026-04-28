import type { InsertEvent } from "@workspace/db";

export function isValidUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed === "#" || trimmed.includes("#")) return false;
  if (!trimmed.startsWith("https://")) return false;
  try {
    const parsed = new URL(trimmed);
    if (!parsed.hostname || parsed.hostname.length < 3) return false;
    return true;
  } catch {
    return false;
  }
}

export function hasMeaningfulContent(event: InsertEvent): boolean {
  return Boolean(
    event.startDate ||
      event.endDate ||
      event.organizer ||
      event.image ||
      (event.tags && event.tags.length > 0) ||
      event.prize ||
      event.description ||
      event.location,
  );
}

export function dedupeByUrl<T extends { url: string }>(items: T[]): {
  unique: T[];
  duplicates: number;
} {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    const key = item.url.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return { unique, duplicates: items.length - unique.length };
}
