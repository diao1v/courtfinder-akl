import { DEFAULT_TIMEZONE } from "../config";
import * as kvCache from "./kv-cache";
import * as alerter from "./email-alerter";
import { mergeProviderData } from "./transformer";
import { fetchActiveData } from "../providers/active";
import { fetchEvergreenData, type EvergreenCredentials } from "../providers/evergreen";
import { detectChanges } from "./change-detector";
import { notifySlotChanges } from "./webhook";
import type { ProviderStatus, ActiveVenue, EvergreenTimeSlot } from "../types";
import type { Env } from "../env";
import { getEnvNumber } from "../env";

/**
 * Get the next N days as YYYY-MM-DD strings (in Auckland timezone)
 */
function getNextDays(count: number, timezone: string): string[] {
  const dates: string[] = [];
  const now = new Date();

  for (let i = 0; i < count; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() + i);

    // Format in Auckland timezone
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
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
export async function refreshAllData(env: Env): Promise<void> {
  const timezone = env.TZ || DEFAULT_TIMEZONE;
  const fetchDaysAhead = getEnvNumber(env, "FETCH_DAYS_AHEAD", 7);
  const dates = getNextDays(fetchDaysAhead, timezone);
  const now = new Date().toISOString();

  console.log(`[Refresh] Starting refresh for dates: ${dates[0]} to ${dates[dates.length - 1]}`);

  let activeData: Map<string, Record<string, ActiveVenue>> | null = null;
  let evergreenData: Map<string, EvergreenTimeSlot[]> | null = null;

  let activeStatus: ProviderStatus = { status: "ok", last_fetch: now };
  let evergreenStatus: ProviderStatus = { status: "ok", last_fetch: now };

  let activeError: Error | null = null;
  let evergreenError: Error | null = null;

  // Evergreen credentials from env
  const evergreenCredentials: EvergreenCredentials = {
    email: env.EVERGREEN_EMAIL,
    password: env.EVERGREEN_PASSWORD,
  };

  // Fetch from both providers in parallel
  const [activeResult, evergreenResult] = await Promise.allSettled([
    fetchActiveData(dates),
    fetchEvergreenData(dates, evergreenCredentials),
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
  }

  // Check for failures and send alerts
  if (activeError && evergreenError) {
    // Both failed
    await alerter.onRefreshFailure(
      env,
      new Error(`Both providers failed. Active: ${activeError.message}, Evergreen: ${evergreenError.message}`)
    );
  } else if (activeError) {
    await alerter.onRefreshFailure(env, activeError, "Active");
  } else if (evergreenError) {
    await alerter.onRefreshFailure(env, evergreenError, "Evergreen");
  } else {
    // Both succeeded - check for recovery
    await alerter.onRecovery(env);
  }

  // Only update cache if we got at least some data
  if (
    (activeData && activeData.size > 0) ||
    (evergreenData && evergreenData.size > 0)
  ) {
    // Get previous data for change detection
    const previousData = await kvCache.getCachedData(env.CACHE);

    const mergedData = mergeProviderData(
      activeData,
      evergreenData,
      dates,
      activeStatus,
      evergreenStatus
    );

    // Detect slots that became available
    const changes = detectChanges(previousData, mergedData);

    // Notify webhook targets about newly available slots
    if (changes.length > 0) {
      console.log(`[Refresh] Detected ${changes.length} newly available slots, sending webhooks`);
      await notifySlotChanges(env, changes);
    }

    // Save new data to cache
    await kvCache.setCachedData(env.CACHE, mergedData);
    console.log(`[Refresh] Cache updated at ${mergedData.generated_at}`);
  } else {
    console.error("[Refresh] No data from any provider, keeping stale cache");
  }
}
