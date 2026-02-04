// ============================================
// Internal Types
// ============================================

export type VenueId = "active-bond" | "active-corinthian" | "evergreen";
export type Provider = "active" | "evergreen";

export interface Venue {
  id: VenueId;
  name: string;
  address: string;
  provider: Provider;
}

export interface TimeSlot {
  available: boolean;
  only_premium?: boolean; // Evergreen only: true when only Court 7 is available
}

export interface DaySummary {
  total_slots: number;
  available_slots: number;
}

export interface DayAvailability {
  slots: Record<string, TimeSlot>; // Key: "HH:00" (e.g., "06:00")
  summary: DaySummary;
}

export interface VenueAvailability {
  name: string;
  address: string;
  dates: Record<string, DayAvailability>; // Key: "YYYY-MM-DD"
}

export interface ProviderStatus {
  status: "ok" | "error";
  last_fetch: string | null;
  error?: string;
}

export interface CachedData {
  generated_at: string; // ISO 8601 timestamp
  week_start: string; // "YYYY-MM-DD"
  week_end: string;
  venues: Record<VenueId, VenueAvailability>;
  provider_status: {
    active: ProviderStatus;
    evergreen: ProviderStatus;
  };
}

// ============================================
// Active API Types
// ============================================

export interface ActiveResponse {
  status: string;
  code: number;
  message: string;
  data: Record<string, ActiveVenue>;
  error: Record<string, unknown>;
}

export interface ActiveVenue {
  venue: {
    id: number;
    name: string;
    status: string;
    address: string;
    phone: string;
    email: string;
    description: string | null;
  };
  courts: Record<string, ActiveCourt>;
}

export interface ActiveCourt {
  court: {
    id: number;
    name: string;
  };
  timetable: ActiveTimeSlot[];
}

export interface ActiveTimeSlot {
  start_time: string; // "HH:00"
  end_time: string;
  status: "Available" | "Booked" | "Unavailable";
  user_name: string | null;
}

// ============================================
// Evergreen API Types
// ============================================

export interface EvergreenLoginResponse {
  errorCode: number;
  errorInfo: string;
  data: {
    token: string;
  };
}

export interface EvergreenCourtListResponse {
  errorCode: number;
  data: EvergreenTimeSlot[];
}

export interface EvergreenTimeSlot {
  time: string; // "HH:00"
  childer: EvergreenCourt[]; // Note: typo in API
}

export interface EvergreenCourt {
  id: number;
  court_id: number;
  name: string; // "🏸 1" or "🏓 1"
  sort: number;
  unavailable: 0 | 1;
  booked: 0 | 1;
  booking: 0 | 1;
  user_id: number;
  selected: number;
  time: string;
  light: number;
}

// ============================================
// API Request/Response Types
// ============================================

export interface AvailabilityRequest {
  venues?: string[];
  start_date?: string;
}

export interface AvailabilityResponse {
  generated_at: string;
  week_start: string;
  week_end: string;
  venues: Record<string, VenueAvailability>;
}

export interface HealthResponse {
  status: "ok" | "degraded" | "error";
  last_refresh: string | null;
  cache_age_seconds: number | null;
  providers: {
    active: ProviderStatus;
    evergreen: ProviderStatus;
  };
}

export interface VenuesResponse {
  venues: Venue[];
}

export interface ErrorResponse {
  error: string;
  message: string;
  available_venues?: string[];
}
