import type { CachedData, VenueId, VenueAvailability } from "../types";
import type { Env } from "../env";
import { getEnvNumber } from "../env";

// KV key for availability data
const CACHE_KEY = "availability";

// Metadata stored with KV value
interface CacheMetadata {
  last_refresh: string; // ISO 8601 timestamp
}

/**
 * Get cached data from KV, optionally filtered by venue IDs
 */
export async function getCachedData(
  kv: KVNamespace,
  venueIds?: VenueId[]
): Promise<CachedData | null> {
  const result = await kv.get<CachedData>(CACHE_KEY, "json");

  if (!result) return null;

  // If no filter, return all data
  if (!venueIds || venueIds.length === 0) {
    return result;
  }

  // Filter to requested venues
  const filteredVenues: Record<string, VenueAvailability> = {};
  for (const venueId of venueIds) {
    if (result.venues[venueId]) {
      filteredVenues[venueId] = result.venues[venueId];
    }
  }

  return {
    ...result,
    venues: filteredVenues as Record<VenueId, VenueAvailability>,
  };
}

/**
 * Set cached data in KV
 */
export async function setCachedData(
  kv: KVNamespace,
  data: CachedData
): Promise<void> {
  const metadata: CacheMetadata = {
    last_refresh: new Date().toISOString(),
  };

  await kv.put(CACHE_KEY, JSON.stringify(data), {
    metadata,
  });
}

/**
 * Get cache metadata (last refresh time)
 */
export async function getCacheMetadata(
  kv: KVNamespace
): Promise<CacheMetadata | null> {
  const { metadata } = await kv.getWithMetadata<CachedData, CacheMetadata>(
    CACHE_KEY,
    "json"
  );
  return metadata;
}

/**
 * Check if cache has data
 */
export async function hasData(kv: KVNamespace): Promise<boolean> {
  const metadata = await getCacheMetadata(kv);
  return metadata !== null;
}

/**
 * Get cache age in seconds
 */
export async function getCacheAge(kv: KVNamespace): Promise<number | null> {
  const metadata = await getCacheMetadata(kv);
  if (!metadata) return null;

  const lastRefresh = new Date(metadata.last_refresh);
  return Math.floor((Date.now() - lastRefresh.getTime()) / 1000);
}

/**
 * Get last refresh timestamp
 */
export async function getLastRefresh(kv: KVNamespace): Promise<Date | null> {
  const metadata = await getCacheMetadata(kv);
  if (!metadata) return null;
  return new Date(metadata.last_refresh);
}

/**
 * Check if cache is stale (past TTL)
 */
export async function isStale(kv: KVNamespace, env: Env): Promise<boolean> {
  const metadata = await getCacheMetadata(kv);
  if (!metadata) return true;

  const lastRefresh = new Date(metadata.last_refresh);
  const ageMs = Date.now() - lastRefresh.getTime();
  const ttlMinutes = getEnvNumber(env, "CACHE_TTL_MINUTES", 20);
  return ageMs > ttlMinutes * 60 * 1000;
}

/**
 * Check if cache is too old to serve (past stale serve limit)
 */
export async function isTooOldToServe(kv: KVNamespace, env: Env): Promise<boolean> {
  const metadata = await getCacheMetadata(kv);
  if (!metadata) return true;

  const lastRefresh = new Date(metadata.last_refresh);
  const ageMs = Date.now() - lastRefresh.getTime();
  const staleServeMinutes = getEnvNumber(env, "STALE_SERVE_MINUTES", 60);
  return ageMs > staleServeMinutes * 60 * 1000;
}

/**
 * Get the date range in cache
 */
export async function getDateRange(
  kv: KVNamespace
): Promise<{ start: string; end: string } | null> {
  const data = await kv.get<CachedData>(CACHE_KEY, "json");
  if (!data) return null;
  return {
    start: data.week_start,
    end: data.week_end,
  };
}

/**
 * Check if a date is within the cached range
 */
export async function isDateInRange(
  kv: KVNamespace,
  date: string
): Promise<boolean> {
  const data = await kv.get<CachedData>(CACHE_KEY, "json");
  if (!data) return false;
  return date >= data.week_start && date <= data.week_end;
}

/**
 * Get provider status from cache
 */
export async function getProviderStatus(kv: KVNamespace) {
  const data = await kv.get<CachedData>(CACHE_KEY, "json");
  return data?.provider_status ?? null;
}
