import { Hono } from "hono";
import { logger } from "hono/logger";
import type { Env } from "./env";
import { apiKeyAuth } from "./middleware/auth";
import healthRoute from "./routes/health";
import venuesRoute from "./routes/venues";
import availabilityRoute from "./routes/availability";
import refreshRoute from "./routes/refresh";
import { refreshAllData } from "./services/refresh";

// Create Hono app with typed bindings
const app = new Hono<{ Bindings: Env }>();

// Middleware
app.use("*", logger());

// Public routes (no auth required)
app.route("/health", healthRoute);

// Protected routes (API key required)
app.use("/venues/*", apiKeyAuth);
app.use("/availability/*", apiKeyAuth);
app.use("/refresh/*", apiKeyAuth);
app.route("/venues", venuesRoute);
app.route("/availability", availabilityRoute);
app.route("/refresh", refreshRoute);

// Root route
app.get("/", (c) => {
  return c.json({
    name: "courtfinder-akl",
    version: "2.0.0",
    runtime: "Cloudflare Workers",
    description: "Auckland badminton court availability aggregator",
    endpoints: {
      health: "GET /health",
      venues: "GET /venues (requires X-API-Key)",
      availability: "POST /availability (requires X-API-Key)",
      refresh: "POST /refresh (requires X-API-Key)",
    },
  });
});

// 404 handler
app.notFound((c) => {
  return c.json(
    {
      error: "NOT_FOUND",
      message: `Route ${c.req.method} ${c.req.path} not found`,
    },
    404
  );
});

// Error handler
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json(
    {
      error: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    },
    500
  );
});

// Export the Worker
export default {
  // HTTP request handler
  fetch: app.fetch,

  // Scheduled (cron) handler
  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    console.log(`[Scheduler] Cron triggered at ${new Date().toISOString()}`);
    console.log(`[Scheduler] Cron event: ${event.cron}`);

    // Use waitUntil to ensure the refresh completes even if the worker times out
    ctx.waitUntil(
      (async () => {
        try {
          await refreshAllData(env);
          console.log("[Scheduler] Refresh completed successfully");
        } catch (error) {
          console.error("[Scheduler] Refresh failed:", error);
        }
      })()
    );
  },
};
