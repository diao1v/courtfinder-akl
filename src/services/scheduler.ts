import * as cron from "node-cron";
import { config } from "../config";
import { cache } from "./cache";
import { alertService } from "./alerter";
import { mergeProviderData } from "./transformer";
import { fetchActiveData } from "../providers/active";
import { fetchEvergreenData, clearAuthToken } from "../providers/evergreen";
import type { ProviderStatus, ActiveVenue, EvergreenTimeSlot } from "../types";

/**
 * Get the next N days as YYYY-MM-DD strings (in Auckland timezone)
 */
function getNextDays(count: number): string[] {
  const dates: string[] = [];
  const now = new Date();

  for (let i = 0; i < count; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() + i);

    // Format in Auckland timezone
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: config.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    dates.push(formatter.format(date));
  }

  return dates;
}

/**
 * Refresh all availability data from providers
 */
export async function refreshAllData(): Promise<void> {
  const dates = getNextDays(config.cron.fetchDaysAhead);
  const now = new Date().toISOString();

  console.log(`[Refresh] Starting refresh for dates: ${dates[0]} to ${dates[dates.length - 1]}`);

  let activeData: Map<string, Record<string, ActiveVenue>> | null = null;
  let evergreenData: Map<string, EvergreenTimeSlot[]> | null = null;

  let activeStatus: ProviderStatus = { status: "ok", last_fetch: now };
  let evergreenStatus: ProviderStatus = { status: "ok", last_fetch: now };

  let activeError: Error | null = null;
  let evergreenError: Error | null = null;

  // Fetch from both providers in parallel
  const [activeResult, evergreenResult] = await Promise.allSettled([
    fetchActiveData(dates),
    fetchEvergreenData(dates),
  ]);

  // Process Active result
  if (activeResult.status === "fulfilled") {
    activeData = activeResult.value;
    if (activeData.size === 0) {
      activeStatus = { status: "error", last_fetch: now, error: "No data returned" };
      activeError = new Error("Active provider returned no data");
    } else {
      console.log(`[Refresh] Active: ${activeData.size} days fetched`);
    }
  } else {
    activeStatus = {
      status: "error",
      last_fetch: now,
      error: activeResult.reason?.message || "Unknown error",
    };
    activeError = activeResult.reason;
    console.error("[Refresh] Active failed:", activeResult.reason);
  }

  // Process Evergreen result
  if (evergreenResult.status === "fulfilled") {
    evergreenData = evergreenResult.value;
    if (evergreenData.size === 0) {
      evergreenStatus = { status: "error", last_fetch: now, error: "No data returned" };
      evergreenError = new Error("Evergreen provider returned no data");
    } else {
      console.log(`[Refresh] Evergreen: ${evergreenData.size} days fetched`);
    }
  } else {
    evergreenStatus = {
      status: "error",
      last_fetch: now,
      error: evergreenResult.reason?.message || "Unknown error",
    };
    evergreenError = evergreenResult.reason;
    console.error("[Refresh] Evergreen failed:", evergreenResult.reason);

    // Clear auth token on Evergreen failure (might be expired)
    clearAuthToken();
  }

  // Check for failures and send alerts
  if (activeError && evergreenError) {
    // Both failed
    await alertService.onRefreshFailure(
      new Error(`Both providers failed. Active: ${activeError.message}, Evergreen: ${evergreenError.message}`)
    );
  } else if (activeError) {
    await alertService.onRefreshFailure(activeError, "Active");
  } else if (evergreenError) {
    await alertService.onRefreshFailure(evergreenError, "Evergreen");
  } else {
    // Both succeeded - check for recovery
    await alertService.onRecovery();
  }

  // Only update cache if we got at least some data
  if (
    (activeData && activeData.size > 0) ||
    (evergreenData && evergreenData.size > 0)
  ) {
    const mergedData = mergeProviderData(
      activeData,
      evergreenData,
      dates,
      activeStatus,
      evergreenStatus
    );
    cache.set(mergedData);
    console.log(`[Refresh] Cache updated at ${mergedData.generated_at}`);
  } else {
    console.error("[Refresh] No data from any provider, keeping stale cache");
  }
}

let cronTask: cron.ScheduledTask | null = null;

/**
 * Start the cron scheduler
 */
export function startScheduler(): void {
  // Validate cron expression
  if (!cron.validate(config.cron.schedule)) {
    console.error(`Invalid cron expression: ${config.cron.schedule}`);
    process.exit(1);
  }

  // Schedule the cron job
  cronTask = cron.schedule(config.cron.schedule, async () => {
    console.log(`[Scheduler] Cron triggered at ${new Date().toISOString()}`);
    try {
      await refreshAllData();
    } catch (error) {
      console.error("[Scheduler] Unexpected error during refresh:", error);
    }
  });

  console.log(`[Scheduler] Cron job scheduled: ${config.cron.schedule}`);
}

/**
 * Stop the cron scheduler
 */
export function stopScheduler(): void {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
    console.log("[Scheduler] Cron job stopped");
  }
}

/**
 * Run initial data fetch on startup
 */
export async function initialRefresh(): Promise<void> {
  console.log("[Startup] Running initial data refresh...");
  try {
    await refreshAllData();
    console.log("[Startup] Initial refresh completed");
  } catch (error) {
    console.error("[Startup] Initial refresh failed:", error);
    // Don't exit - the server can still start and serve stale data if available
  }
}
