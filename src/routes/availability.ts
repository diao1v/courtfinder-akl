import { Hono } from "hono";
import { z } from "zod";
import * as kvCache from "../services/kv-cache";
import { VALID_VENUE_IDS, DEFAULT_TIMEZONE } from "../config";
import type { AvailabilityResponse, ErrorResponse, VenueId } from "../types";
import type { Env } from "../env";

const availability = new Hono<{ Bindings: Env }>();

// Request validation schema
const availabilityRequestSchema = z.object({
  venues: z
    .array(z.string())
    .optional()
    .refine(
      (venues) => {
        if (!venues) return true;
        return venues.every((v) => VALID_VENUE_IDS.includes(v as VenueId));
      },
      { message: "Invalid venue ID" }
    ),
  start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional(),
});

// Get today's date in YYYY-MM-DD format (Auckland timezone)
function getTodayDate(timezone: string): string {
  const now = new Date();
  // Format in Auckland timezone
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(now);
}

availability.post("/", async (c) => {
  const kv = c.env.CACHE;
  const timezone = c.env.TZ || DEFAULT_TIMEZONE;

  // Parse request body
  let body: unknown = {};
  try {
    const text = await c.req.text();
    if (text) {
      body = JSON.parse(text);
    }
  } catch {
    return c.json<ErrorResponse>(
      {
        error: "INVALID_JSON",
        message: "Request body must be valid JSON",
      },
      400
    );
  }

  // Validate request
  const parseResult = availabilityRequestSchema.safeParse(body);
  if (!parseResult.success) {
    const firstIssue = parseResult.error.issues[0];
    const errorMessage = firstIssue?.message || "Invalid request";
    const errorField = firstIssue?.path?.join(".") || "unknown";

    if (errorMessage.includes("venue")) {
      return c.json<ErrorResponse>(
        {
          error: "VENUE_NOT_FOUND",
          message: `Unknown venue ID in request`,
          available_venues: VALID_VENUE_IDS,
        },
        400
      );
    }

    if (errorMessage.includes("Date")) {
      return c.json<ErrorResponse>(
        {
          error: "INVALID_DATE",
          message: errorMessage,
        },
        400
      );
    }

    return c.json<ErrorResponse>(
      {
        error: "INVALID_REQUEST",
        message: `${errorField}: ${errorMessage}`,
      },
      400
    );
  }

  const { venues: requestedVenues, start_date } = parseResult.data;

  // Check if cache has data
  const hasDataResult = await kvCache.hasData(kv);
  if (!hasDataResult) {
    return c.json<ErrorResponse>(
      {
        error: "SERVICE_UNAVAILABLE",
        message: "Data not yet available. Please try again shortly.",
      },
      503
    );
  }

  // Check if cache is too old to serve
  const isTooOld = await kvCache.isTooOldToServe(kv, c.env);
  if (isTooOld) {
    return c.json<ErrorResponse>(
      {
        error: "SERVICE_UNAVAILABLE",
        message: "Data is too stale. Service is experiencing issues.",
      },
      503
    );
  }

  // Default to today if no start_date provided
  const startDate = start_date || getTodayDate(timezone);

  // Check if requested date is in cached range
  const isInRange = await kvCache.isDateInRange(kv, startDate);
  if (!isInRange) {
    const dateRange = await kvCache.getDateRange(kv);
    return c.json<ErrorResponse>(
      {
        error: "DATE_OUT_OF_RANGE",
        message: `Requested date is outside cached range. Available: ${dateRange?.start} to ${dateRange?.end}`,
      },
      400
    );
  }

  // Get cached data, filtered by venues if specified
  const venueIds = requestedVenues as VenueId[] | undefined;
  const cachedData = await kvCache.getCachedData(kv, venueIds);

  if (!cachedData) {
    return c.json<ErrorResponse>(
      {
        error: "SERVICE_UNAVAILABLE",
        message: "Unable to retrieve data.",
      },
      503
    );
  }

  // Filter dates to only include start_date and the following 6 days (7 days total)
  const filteredVenues: Record<string, typeof cachedData.venues[VenueId]> = {};

  for (const [venueId, venueData] of Object.entries(cachedData.venues)) {
    const filteredDates: typeof venueData.dates = {};

    // Get dates starting from start_date
    const sortedDates = Object.keys(venueData.dates).sort();
    const startIndex = sortedDates.findIndex((d) => d >= startDate);

    if (startIndex !== -1) {
      // Take up to 7 days starting from start_date
      const datesToInclude = sortedDates.slice(startIndex, startIndex + 7);
      for (const date of datesToInclude) {
        if (venueData.dates[date]) {
          filteredDates[date] = venueData.dates[date];
        }
      }
    }

    filteredVenues[venueId] = {
      ...venueData,
      dates: filteredDates,
    };
  }

  // Calculate actual week range from filtered data
  const allDates = Object.values(filteredVenues).flatMap((v) =>
    Object.keys(v.dates)
  );
  const uniqueDates = [...new Set(allDates)].sort();

  const response: AvailabilityResponse = {
    generated_at: cachedData.generated_at,
    week_start: uniqueDates[0] || startDate,
    week_end: uniqueDates[uniqueDates.length - 1] || startDate,
    venues: filteredVenues,
  };

  return c.json(response);
});

export default availability;
