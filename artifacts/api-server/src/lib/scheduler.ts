import { logger } from "./logger";
import { runAllScrapers } from "./scraperRunner";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

let intervalHandle: NodeJS.Timeout | null = null;
let running = false;

async function safeRun(): Promise<void> {
  if (running) {
    logger.info("Skipping scheduled scrape — previous run still in progress");
    return;
  }
  running = true;
  try {
    await runAllScrapers();
  } catch (err) {
    logger.error({ err }, "Scheduled scrape failed");
  } finally {
    running = false;
  }
}

export function startScheduler(): void {
  if (intervalHandle) return;
  logger.info({ intervalMs: SIX_HOURS_MS }, "Starting scrape scheduler");
  // Kick off an initial run after 30s so the server is healthy first.
  setTimeout(() => {
    void safeRun();
  }, 30_000);
  intervalHandle = setInterval(() => {
    void safeRun();
  }, SIX_HOURS_MS);
}
