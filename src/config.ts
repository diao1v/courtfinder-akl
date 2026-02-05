import type { VenueId, Venue } from "./types";

// Static venue data
export const VENUES: Venue[] = [
  {
    id: "active-bond" as VenueId,
    name: "Active - Bond Crescent",
    address: "47 Bond Crescent, Forrest Hill, Auckland 0620",
    provider: "active",
  },
  {
    id: "active-corinthian" as VenueId,
    name: "Active - Corinthian Dr.",
    address: "20 Corinthian Drive, Albany, Auckland 0632",
    provider: "active",
  },
  {
    id: "evergreen" as VenueId,
    name: "Evergreen Badminton",
    address: "22B Corinthian Drive, Albany, Auckland 0632",
    provider: "evergreen",
  },
];

// Valid venue IDs for validation
export const VALID_VENUE_IDS: VenueId[] = VENUES.map((v) => v.id);

// Time slot configuration
export const SLOT_START_HOUR = 6; // 06:00
export const SLOT_END_HOUR = 22; // 22:00 (last slot)

// Generate array of time slots: ["06:00", "07:00", ..., "22:00"]
export const TIME_SLOTS: string[] = [];
for (let hour = SLOT_START_HOUR; hour <= SLOT_END_HOUR; hour++) {
  TIME_SLOTS.push(`${hour.toString().padStart(2, "0")}:00`);
}

// Evergreen pre-auth token (public, used for initial API contact)
export const EVERGREEN_PRE_AUTH_TOKEN = "de0d01e2fe6b212417d2514bc34a338f";

// Default timezone
export const DEFAULT_TIMEZONE = "Pacific/Auckland";
