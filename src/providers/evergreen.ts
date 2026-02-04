import { config } from "../config";
import { evergreenHeaders, fetchWithRetry } from "./http-client";
import type {
  EvergreenLoginResponse,
  EvergreenCourtListResponse,
  EvergreenTimeSlot,
  EvergreenCourt,
} from "../types";

const BASE_URL = "https://booking.evergreensports.co.nz/public/home/Home";

// Token management
let authToken: string | null = null;
let tokenExpiry: Date | null = null;

/**
 * Login to Evergreen and get auth token
 */
async function login(): Promise<string> {
  const url = `${BASE_URL}/userLogin`;

  const response = await fetchWithRetry(url, {
    method: "POST",
    headers: {
      ...evergreenHeaders,
      token: config.evergreen.preAuthToken,
    },
    body: JSON.stringify({
      email: config.evergreen.email,
      password: config.evergreen.password,
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
 * Get a valid auth token, logging in if necessary
 */
async function getAuthToken(): Promise<string> {
  // If we have a token and it's not expired, use it
  if (authToken && tokenExpiry && tokenExpiry > new Date()) {
    return authToken;
  }

  // Otherwise, login to get a new token
  console.log("Logging in to Evergreen...");
  authToken = await login();

  // Assume token is valid for 1 hour (we'll refresh on 401)
  tokenExpiry = new Date(Date.now() + 60 * 60 * 1000);

  console.log("Evergreen login successful");
  return authToken;
}

/**
 * Clear the auth token (call on 401 or auth failure)
 */
export function clearAuthToken(): void {
  authToken = null;
  tokenExpiry = null;
}

/**
 * Fetch court availability for a single date from Evergreen API
 */
async function fetchDate(
  date: string,
  token: string,
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
    clearAuthToken();
    const newToken = await getAuthToken();
    return fetchDate(date, newToken, false);
  }

  if (!response.ok) {
    throw new Error(`Evergreen API returned ${response.status}: ${response.statusText}`);
  }

  const data = (await response.json()) as EvergreenCourtListResponse;

  if (data.errorCode !== 0) {
    // Check if it's an auth error
    if (retryOnAuth) {
      console.log("Evergreen returned error, attempting re-login...");
      clearAuthToken();
      const newToken = await getAuthToken();
      return fetchDate(date, newToken, false);
    }
    throw new Error(`Evergreen API error: ${data.errorCode}`);
  }

  return data.data;
}

/**
 * Fetch availability for multiple dates from Evergreen API
 */
export async function fetchEvergreenData(
  dates: string[]
): Promise<Map<string, EvergreenTimeSlot[]>> {
  const results = new Map<string, EvergreenTimeSlot[]>();

  // Get auth token first
  const token = await getAuthToken();

  // Fetch dates sequentially to be gentler on the API
  for (const date of dates) {
    try {
      const data = await fetchDate(date, token);
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
