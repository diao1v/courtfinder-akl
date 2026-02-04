import { Hono } from "hono";
import { refreshAllData } from "../services/scheduler";
import { cache } from "../services/cache";

const refresh = new Hono();

refresh.post("/", async (c) => {
  const startTime = Date.now();

  try {
    await refreshAllData();
    const duration = Date.now() - startTime;

    return c.json({
      success: true,
      message: "Data refreshed successfully",
      duration_ms: duration,
      cache: {
        generated_at: cache.get()?.generated_at,
        is_stale: cache.isStale(),
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
