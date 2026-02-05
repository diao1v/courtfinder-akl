import { EVERGREEN_PRE_AUTH_TOKEN } from "../config";
import { evergreenHeaders, fetchWithRetry } from "./http-client";
import type {
  EvergreenLoginResponse,
  EvergreenCourtListResponse,
  EvergreenTimeSlot,
  EvergreenCourt,
} from "../types";

const BASE_URL = "https://booking.evergreensports.co.nz/public/home/Home";

/**
 * Evergreen credentials interface
 */
export interface EvergreenCredentials {
  email: string;
  password: string;
}

/**
 * Login to Evergreen and get auth token
 */
async function login(credentials: EvergreenCredentials): Promise<string> {
  const url = `${BASE_URL}/userLogin`;

  const response = await fetchWithRetry(url, {
    method: "POST",
    headers: {
      ...evergreenHeaders,
      token: EVERGREEN_PRE_AUTH_TOKEN,
    },
    body: JSON.stringify({
      email: credentials.email,
      password: credentials.password,
    }),
  });

  if (!response.ok) {
    throw new Error(`Evergreen login failed with status ${response.status}`);
  }

  const data = (await response.json()) as EvergreenLoginResponse;

  if (data.errorCode !== 0) {
    throw new Error(`Evergreen login failed: ${data.errorInfo || "Unknown error"}`);
  }

  if (!data.data?.token) {
    throw new Error("Evergreen login response missing token");
  }

  return data.data.token;
}

/**
 * Fetch court availability for a single date from Evergreen API
 */
async function fetchDate(
  date: string,
  token: string,
  credentials: EvergreenCredentials,
  retryOnAuth = true
): Promise<EvergreenTimeSlot[]> {
  const url = `${BASE_URL}/getAllCourtList`;

  const response = await fetchWithRetry(url, {
    method: "POST",
    headers: {
      ...evergreenHeaders,
      token: token,
    },
    body: JSON.stringify({ date }),
  });

  // If we get a 401 or similar auth error, try to re-login once
  if (response.status === 401 && retryOnAuth) {
    console.log("Evergreen auth token expired, re-logging in...");
    const newToken = await login(credentials);
    return fetchDate(date, newToken, credentials, false);
  }

  if (!response.ok) {
    throw new Error(`Evergreen API returned ${response.status}: ${response.statusText}`);
  }

  const data = (await response.json()) as EvergreenCourtListResponse;

  if (data.errorCode !== 0) {
    // Check if it's an auth error
    if (retryOnAuth) {
      console.log("Evergreen returned error, attempting re-login...");
      const newToken = await login(credentials);
      return fetchDate(date, newToken, credentials, false);
    }
    throw new Error(`Evergreen API error: ${data.errorCode}`);
  }

  return data.data;
}

/**
 * Fetch availability for multiple dates from Evergreen API
 */
export async function fetchEvergreenData(
  dates: string[],
  credentials: EvergreenCredentials
): Promise<Map<string, EvergreenTimeSlot[]>> {
  const results = new Map<string, EvergreenTimeSlot[]>();

  // Get auth token first
  console.log("Logging in to Evergreen...");
  const token = await login(credentials);
  console.log("Evergreen login successful");

  // Fetch dates sequentially to be gentler on the API
  for (const date of dates) {
    try {
      const data = await fetchDate(date, token, credentials);
      results.set(date, data);
    } catch (error) {
      console.error(`Failed to fetch Evergreen data for ${date}:`, error);
      // Continue with other dates even if one fails
    }
  }

  return results;
}

/**
 * Check if a court is a badminton court (not table tennis)
 */
export function isBadmintonCourt(court: EvergreenCourt): boolean {
  return court.name.startsWith("🏸");
}

/**
 * Check if a court is the premium Court 7
 */
export function isPremiumCourt(court: EvergreenCourt): boolean {
  return court.name === "🏸 7";
}

/**
 * Check if a court is a standard badminton court (1-6)
 */
export function isStandardCourt(court: EvergreenCourt): boolean {
  return court.name.startsWith("🏸") && court.name !== "🏸 7";
}

/**
 * Check if an Evergreen court slot is available
 */
export function isEvergreenSlotAvailable(court: EvergreenCourt): boolean {
  return court.unavailable === 0 && court.booked === 0 && court.booking === 0;
}
