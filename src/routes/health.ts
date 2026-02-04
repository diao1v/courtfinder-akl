import { Hono } from "hono";
import { cache } from "../services/cache";
import type { HealthResponse } from "../types";

const health = new Hono();

health.get("/", (c) => {
  const providerStatus = cache.getProviderStatus();
  const lastRefresh = cache.getLastRefresh();
  const cacheAge = cache.getAge();

  // Determine overall status
  let status: "ok" | "degraded" | "error" = "ok";

  if (!cache.hasData()) {
    status = "error";
  } else if (cache.isTooOldToServe()) {
    status = "error";
  } else if (cache.isStale()) {
    status = "degraded";
  } else if (
    providerStatus?.active.status === "error" ||
    providerStatus?.evergreen.status === "error"
  ) {
    status = "degraded";
  }

  const response: HealthResponse = {
    status,
    last_refresh: lastRefresh?.toISOString() ?? null,
    cache_age_seconds: cacheAge,
    providers: providerStatus ?? {
      active: { status: "error", last_fetch: null },
      evergreen: { status: "error", last_fetch: null },
    },
  };

  const httpStatus = status === "error" ? 503 : 200;
  return c.json(response, httpStatus);
});

export default health;
