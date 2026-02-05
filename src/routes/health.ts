import { Hono } from "hono";
import * as kvCache from "../services/kv-cache";
import type { HealthResponse } from "../types";
import type { Env } from "../env";

const health = new Hono<{ Bindings: Env }>();

health.get("/", async (c) => {
  const kv = c.env.CACHE;

  const providerStatus = await kvCache.getProviderStatus(kv);
  const lastRefresh = await kvCache.getLastRefresh(kv);
  const cacheAge = await kvCache.getCacheAge(kv);
  const hasDataResult = await kvCache.hasData(kv);
  const isTooOld = await kvCache.isTooOldToServe(kv, c.env);
  const isStaleResult = await kvCache.isStale(kv, c.env);

  // Determine overall status
  let status: "ok" | "degraded" | "error" = "ok";

  if (!hasDataResult) {
    status = "error";
  } else if (isTooOld) {
    status = "error";
  } else if (isStaleResult) {
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
