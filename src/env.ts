// Cloudflare Workers environment bindings
export interface Env {
  // KV namespace for caching
  CACHE: KVNamespace;

  // Email binding for alerts (optional)
  EMAIL?: SendEmail;

  // Secrets
  API_KEY: string;
  EVERGREEN_EMAIL: string;
  EVERGREEN_PASSWORD: string;

  // Environment variables
  FETCH_DAYS_AHEAD: string;
  TZ: string;
  CACHE_TTL_MINUTES: string;
  STALE_SERVE_MINUTES: string;
  ALERT_COOLDOWN_MINUTES: string;

  // Alert email addresses (comma-separated)
  ALERT_FROM?: string;
  ALERT_TO?: string;
}

// Helper to get number from env with default
export function getEnvNumber(env: Env, key: keyof Env, defaultValue: number): number {
  const value = env[key];
  if (typeof value === "string") {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }
  return defaultValue;
}
