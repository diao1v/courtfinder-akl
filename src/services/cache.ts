import { config } from "../config";
import type { CachedData, VenueId, VenueAvailability } from "../types";

class AvailabilityCache {
  private data: CachedData | null = null;
  private lastRefresh: Date | null = null;

  /**
   * Get cached data, optionally filtered by venue IDs
   */
  get(venueIds?: VenueId[]): CachedData | null {
    if (!this.data) return null;

    // If no filter, return all data
    if (!venueIds || venueIds.length === 0) {
      return this.data;
    }

    // Filter to requested venues
    const filteredVenues: Record<string, VenueAvailability> = {};
    for (const venueId of venueIds) {
      if (this.data.venues[venueId]) {
        filteredVenues[venueId] = this.data.venues[venueId];
      }
    }

    return {
      ...this.data,
      venues: filteredVenues as Record<VenueId, VenueAvailability>,
    };
  }

  /**
   * Update the cache with new data
   */
  set(data: CachedData): void {
    this.data = data;
    this.lastRefresh = new Date();
  }

  /**
   * Check if cache is stale (past TTL)
   */
  isStale(): boolean {
    if (!this.lastRefresh) return true;
    const ageMs = Date.now() - this.lastRefresh.getTime();
    return ageMs > config.cache.ttlMinutes * 60 * 1000;
  }

  /**
   * Check if cache is too old to serve (past stale serve limit)
   */
  isTooOldToServe(): boolean {
    if (!this.lastRefresh) return true;
    const ageMs = Date.now() - this.lastRefresh.getTime();
    return ageMs > config.cache.staleServeMinutes * 60 * 1000;
  }

  /**
   * Get cache age in seconds
   */
  getAge(): number | null {
    if (!this.lastRefresh) return null;
    return Math.floor((Date.now() - this.lastRefresh.getTime()) / 1000);
  }

  /**
   * Get last refresh timestamp
   */
  getLastRefresh(): Date | null {
    return this.lastRefresh;
  }

  /**
   * Check if cache has data
   */
  hasData(): boolean {
    return this.data !== null;
  }

  /**
   * Get provider status from cache
   */
  getProviderStatus() {
    return this.data?.provider_status ?? null;
  }

  /**
   * Get the date range in cache
   */
  getDateRange(): { start: string; end: string } | null {
    if (!this.data) return null;
    return {
      start: this.data.week_start,
      end: this.data.week_end,
    };
  }

  /**
   * Check if a date is within the cached range
   */
  isDateInRange(date: string): boolean {
    if (!this.data) return false;
    return date >= this.data.week_start && date <= this.data.week_end;
  }
}

// Export singleton instance
export const cache = new AvailabilityCache();
