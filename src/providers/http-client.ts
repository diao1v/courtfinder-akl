// Browser-like headers to avoid being blocked
const browserHeaders = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
};

// Headers for Active API (cross-origin request)
export const activeHeaders: Record<string, string> = {
  ...browserHeaders,
  Origin: "https://book.bnh.org.nz",
  Referer: "https://book.bnh.org.nz/",
};

// Headers for Evergreen API (same-origin request)
export const evergreenHeaders: Record<string, string> = {
  ...browserHeaders,
  Origin: "https://booking.evergreensports.co.nz",
  Referer: "https://booking.evergreensports.co.nz/front/",
  "Content-Type": "application/json",
};

// Retry configuration
export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export const defaultRetryConfig: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

// Sleep utility
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Fetch with retry logic
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retryConfig: RetryConfig = defaultRetryConfig
): Promise<Response> {
  let lastError: Error | null = null;
  let delay = retryConfig.initialDelayMs;

  for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // Don't retry on client errors (4xx), only server errors (5xx)
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        return response;
      }

      lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }

    // Don't wait after the last attempt
    if (attempt < retryConfig.maxRetries) {
      console.log(
        `Request failed, retrying in ${delay}ms (attempt ${attempt + 1}/${retryConfig.maxRetries})...`
      );
      await sleep(delay);
      delay = Math.min(delay * retryConfig.backoffMultiplier, retryConfig.maxDelayMs);
    }
  }

  throw lastError || new Error("Request failed after retries");
}
