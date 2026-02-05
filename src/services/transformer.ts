import { TIME_SLOTS, VENUES } from "../config";
import {
  getInternalVenueId,
  isActiveSlotAvailable,
} from "../providers/active";
import {
  isBadmintonCourt,
  isPremiumCourt,
  isStandardCourt,
  isEvergreenSlotAvailable,
} from "../providers/evergreen";
import type {
  ActiveVenue,
  EvergreenTimeSlot,
  VenueId,
  VenueAvailability,
  DayAvailability,
  TimeSlot,
  CachedData,
  ProviderStatus,
} from "../types";

/**
 * Transform Active venue data for a single day
 */
function transformActiveDayData(
  venueData: ActiveVenue | undefined
): DayAvailability {
  const slots: Record<string, TimeSlot> = {};
  let availableCount = 0;

  for (const timeSlot of TIME_SLOTS) {
    const availableCourts: string[] = [];

    if (venueData?.courts) {
      // Check each court at this time slot
      for (const courtData of Object.values(venueData.courts)) {
        const slot = courtData.timetable.find((t) => t.start_time === timeSlot);
        if (slot && isActiveSlotAvailable(slot.status)) {
          // Extract court number from name (e.g., "Court 1" -> "1")
          const match = courtData.court.name.match(/\d+/);
          const courtNumber = match ? match[0] : courtData.court.name;
          availableCourts.push(courtNumber);
        }
      }
    }

    const anyAvailable = availableCourts.length > 0;
    const slotData: TimeSlot = { available: anyAvailable };
    if (anyAvailable) {
      slotData.available_courts = availableCourts.sort();
      availableCount++;
    }
    slots[timeSlot] = slotData;
  }

  return {
    slots,
    summary: {
      total_slots: TIME_SLOTS.length,
      available_slots: availableCount,
    },
  };
}

/**
 * Transform Evergreen data for a single day with premium court handling
 */
function transformEvergreenDayData(
  timeSlots: EvergreenTimeSlot[] | undefined
): DayAvailability {
  const slots: Record<string, TimeSlot> = {};
  let availableCount = 0;

  // Build a map of time -> courts for easier lookup
  const timeToCourtMap = new Map<string, EvergreenTimeSlot>();
  if (timeSlots) {
    for (const ts of timeSlots) {
      timeToCourtMap.set(ts.time, ts);
    }
  }

  for (const timeSlot of TIME_SLOTS) {
    const tsData = timeToCourtMap.get(timeSlot);
    let standardAvailable = false;
    let premiumAvailable = false;
    const availableCourts: string[] = [];

    if (tsData?.childer) {
      for (const court of tsData.childer) {
        // Skip non-badminton courts
        if (!isBadmintonCourt(court)) continue;

        const isAvailable = isEvergreenSlotAvailable(court);
        if (!isAvailable) continue;

        // Extract court number from name (e.g., "🏸 1" -> "1")
        const match = court.name.match(/\d+/);
        const courtNumber = match ? match[0] : court.name;
        availableCourts.push(courtNumber);

        if (isPremiumCourt(court)) {
          premiumAvailable = true;
        } else if (isStandardCourt(court)) {
          standardAvailable = true;
        }
      }
    }

    const anyAvailable = standardAvailable || premiumAvailable;
    const onlyPremium = !standardAvailable && premiumAvailable;

    const slot: TimeSlot = { available: anyAvailable };
    if (onlyPremium) {
      slot.only_premium = true;
    }
    if (anyAvailable) {
      slot.available_courts = availableCourts.sort();
    }

    slots[timeSlot] = slot;
    if (anyAvailable) availableCount++;
  }

  return {
    slots,
    summary: {
      total_slots: TIME_SLOTS.length,
      available_slots: availableCount,
    },
  };
}

/**
 * Transform all Active data into venue availability
 */
export function transformActiveData(
  activeData: Map<string, Record<string, ActiveVenue>>
): Map<VenueId, VenueAvailability> {
  const results = new Map<VenueId, VenueAvailability>();

  // Initialize venue structures
  const bondVenue = VENUES.find((v) => v.id === "active-bond")!;
  const corinthianVenue = VENUES.find((v) => v.id === "active-corinthian")!;

  const bondAvailability: VenueAvailability = {
    name: bondVenue.name,
    address: bondVenue.address,
    dates: {},
  };

  const corinthianAvailability: VenueAvailability = {
    name: corinthianVenue.name,
    address: corinthianVenue.address,
    dates: {},
  };

  // Process each date
  for (const [date, venueMap] of activeData) {
    // Process each venue in the response
    for (const [apiVenueId, venueData] of Object.entries(venueMap)) {
      const internalId = getInternalVenueId(apiVenueId);
      if (!internalId) continue;

      const dayAvailability = transformActiveDayData(venueData);

      if (internalId === "active-bond") {
        bondAvailability.dates[date] = dayAvailability;
      } else if (internalId === "active-corinthian") {
        corinthianAvailability.dates[date] = dayAvailability;
      }
    }
  }

  results.set("active-bond", bondAvailability);
  results.set("active-corinthian", corinthianAvailability);

  return results;
}

/**
 * Transform all Evergreen data into venue availability
 */
export function transformEvergreenData(
  evergreenData: Map<string, EvergreenTimeSlot[]>
): VenueAvailability {
  const evergreenVenue = VENUES.find((v) => v.id === "evergreen")!;

  const availability: VenueAvailability = {
    name: evergreenVenue.name,
    address: evergreenVenue.address,
    dates: {},
  };

  // Process each date
  for (const [date, timeSlots] of evergreenData) {
    availability.dates[date] = transformEvergreenDayData(timeSlots);
  }

  return availability;
}

/**
 * Merge all provider data into a single CachedData structure
 */
export function mergeProviderData(
  activeData: Map<string, Record<string, ActiveVenue>> | null,
  evergreenData: Map<string, EvergreenTimeSlot[]> | null,
  dates: string[],
  activeStatus: ProviderStatus,
  evergreenStatus: ProviderStatus
): CachedData {
  const venues: Record<VenueId, VenueAvailability> = {} as Record<
    VenueId,
    VenueAvailability
  >;

  // Transform Active data
  if (activeData && activeData.size > 0) {
    const activeVenues = transformActiveData(activeData);
    for (const [venueId, availability] of activeVenues) {
      venues[venueId] = availability;
    }
  } else {
    // Create empty structures if Active failed
    const bondVenue = VENUES.find((v) => v.id === "active-bond")!;
    const corinthianVenue = VENUES.find((v) => v.id === "active-corinthian")!;
    venues["active-bond"] = {
      name: bondVenue.name,
      address: bondVenue.address,
      dates: {},
    };
    venues["active-corinthian"] = {
      name: corinthianVenue.name,
      address: corinthianVenue.address,
      dates: {},
    };
  }

  // Transform Evergreen data
  if (evergreenData && evergreenData.size > 0) {
    venues["evergreen"] = transformEvergreenData(evergreenData);
  } else {
    // Create empty structure if Evergreen failed
    const evergreenVenue = VENUES.find((v) => v.id === "evergreen")!;
    venues["evergreen"] = {
      name: evergreenVenue.name,
      address: evergreenVenue.address,
      dates: {},
    };
  }

  // Calculate date range
  const sortedDates = [...dates].sort();
  const weekStart = sortedDates[0] || "";
  const weekEnd = sortedDates[sortedDates.length - 1] || "";

  return {
    generated_at: new Date().toISOString(),
    week_start: weekStart,
    week_end: weekEnd,
    venues,
    provider_status: {
      active: activeStatus,
      evergreen: evergreenStatus,
    },
  };
}
