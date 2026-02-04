import { activeHeaders, fetchWithRetry } from "./http-client";
import type { ActiveResponse, ActiveVenue } from "../types";

const BASE_URL = "https://admin.bnh.org.nz/api/v1";

// Mapping from Active API venue IDs to our internal IDs
const VENUE_ID_MAP: Record<string, "active-bond" | "active-corinthian"> = {
  "1": "active-bond",
  "2": "active-corinthian",
};

export interface ActiveProviderResult {
  success: boolean;
  data: Record<string, ActiveVenue> | null;
  error?: string;
}

/**
 * Fetch availability for a single date from Active API
 */
async function fetchDate(date: string): Promise<ActiveResponse> {
  const url = `${BASE_URL}/bookings/all/${date}`;

  const response = await fetchWithRetry(url, {
    method: "GET",
    headers: activeHeaders,
  });

  if (!response.ok) {
    throw new Error(`Active API returned ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return data as ActiveResponse;
}

/**
 * Fetch availability for multiple dates from Active API
 */
export async function fetchActiveData(
  dates: string[]
): Promise<Map<string, Record<string, ActiveVenue>>> {
  const results = new Map<string, Record<string, ActiveVenue>>();

  // Fetch all dates in parallel (but with some concurrency limit)
  const CONCURRENCY = 3;
  for (let i = 0; i < dates.length; i += CONCURRENCY) {
    const batch = dates.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (date) => {
        try {
          const response = await fetchDate(date);
          return { date, data: response.data, error: null };
        } catch (error) {
          console.error(`Failed to fetch Active data for ${date}:`, error);
          return { date, data: null, error };
        }
      })
    );

    for (const result of batchResults) {
      if (result.data) {
        results.set(result.date, result.data);
      }
    }
  }

  return results;
}

/**
 * Get our internal venue ID from Active's venue ID
 */
export function getInternalVenueId(
  activeVenueId: string
): "active-bond" | "active-corinthian" | null {
  return VENUE_ID_MAP[activeVenueId] || null;
}

/**
 * Check if an Active time slot is available
 */
export function isActiveSlotAvailable(status: string): boolean {
  return status === "Available";
}
