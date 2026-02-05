import { Hono } from "hono";
import { refreshAllData } from "../services/refresh";
import * as kvCache from "../services/kv-cache";
import type { Env } from "../env";

const refresh = new Hono<{ Bindings: Env }>();

refresh.post("/", async (c) => {
  const startTime = Date.now();

  try {
    await refreshAllData(c.env);
    const duration = Date.now() - startTime;

    const cachedData = await kvCache.getCachedData(c.env.CACHE);
    const isStale = await kvCache.isStale(c.env.CACHE, c.env);

    return c.json({
      success: true,
      message: "Data refreshed successfully",
      duration_ms: duration,
      cache: {
        generated_at: cachedData?.generated_at,
        is_stale: isStale,
      },
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const message = error instanceof Error ? error.message : "Unknown error";

    return c.json(
      {
        success: false,
        message: `Refresh failed: ${message}`,
        duration_ms: duration,
      },
      500
    );
  }
});

export default refresh;
