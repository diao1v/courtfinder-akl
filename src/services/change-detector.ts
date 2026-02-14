import type { CachedData, VenueId } from "../types";

/**
 * Represents a slot that changed from unavailable to available
 */
export interface SlotChange {
  venueId: VenueId;
  date: string; // YYYY-MM-DD
  timeSlot: string; // HH:00
  availableCourts: string[];
  onlyPremium?: boolean;
}

/**
 * Detect slots that changed from unavailable to available
 *
 * @param previous - Previous cached data (before refresh)
 * @param current - Current data (after refresh)
 * @returns Array of slots that became available
 */
export function detectChanges(
  previous: CachedData | null,
  current: CachedData
): SlotChange[] {
  const changes: SlotChange[] = [];

  // If no previous data, we can't detect changes
  if (!previous) {
    console.log("[ChangeDetector] No previous data, skipping change detection");
    return changes;
  }

  // Iterate through all venues in current data
  for (const venueId of Object.keys(current.venues) as VenueId[]) {
    const currentVenue = current.venues[venueId];
    const previousVenue = previous.venues[venueId];

    // Skip if venue didn't exist before (new venue)
    if (!previousVenue) {
      continue;
    }

    // Iterate through all dates
    for (const date of Object.keys(currentVenue.dates)) {
      const currentDay = currentVenue.dates[date];
      const previousDay = previousVenue.dates[date];

      // Skip if date didn't exist before
      if (!previousDay) {
        continue;
      }

      // Iterate through all time slots
      for (const timeSlot of Object.keys(currentDay.slots)) {
        const currentSlot = currentDay.slots[timeSlot];
        const previousSlot = previousDay.slots[timeSlot];

        // Check if slot changed: unavailable → available
        const wasAvailable = previousSlot?.available ?? false;
        const isAvailable = currentSlot.available;

        if (!wasAvailable && isAvailable) {
          changes.push({
            venueId,
            date,
            timeSlot,
            availableCourts: currentSlot.available_courts || [],
            onlyPremium: currentSlot.only_premium,
          });
        }
      }
    }
  }

  if (changes.length > 0) {
    console.log(`[ChangeDetector] Found ${changes.length} newly available slots`);
  }

  return changes;
}
