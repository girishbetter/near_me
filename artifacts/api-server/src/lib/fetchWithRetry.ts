import { logger } from "./logger";

type FetchOptions = {
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  source?: string;
};

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
};

export async function fetchJsonWithRetry<T = unknown>(
  url: string,
  options: FetchOptions = {},
): Promise<T | null> {
  const {
    headers = {},
    timeoutMs = 20_000,
    maxRetries = 2,
    retryDelayMs = 800,
    source,
  } = options;
  const totalAttempts = maxRetries + 1;
  let lastError: unknown;
  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { ...DEFAULT_HEADERS, ...headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        logger.warn(
          { source, url, status: response.status, attempt },
          "HTTP request returned non-OK status",
        );
        if (response.status >= 500 && attempt < totalAttempts) {
          await delay(retryDelayMs * attempt);
          continue;
        }
        return null;
      }
      return (await response.json()) as T;
    } catch (err) {
      lastError = err;
      logger.warn(
        { source, url, attempt, err: String(err) },
        "HTTP request failed, retrying",
      );
      if (attempt < totalAttempts) {
        await delay(retryDelayMs * attempt);
      }
    }
  }
  logger.error(
    { source, url, err: String(lastError) },
    "HTTP request failed after all retries",
  );
  return null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
