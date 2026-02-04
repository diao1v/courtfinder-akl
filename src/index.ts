import "dotenv/config";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { logger } from "hono/logger";
import { config } from "./config";
import { apiKeyAuth } from "./middleware/auth";
import healthRoute from "./routes/health";
import venuesRoute from "./routes/venues";
import availabilityRoute from "./routes/availability";
import refreshRoute from "./routes/refresh";
import { startScheduler, initialRefresh } from "./services/scheduler";

const app = new Hono();

// Middleware
app.use("*", logger());

// Public routes (no auth required)
app.route("/health", healthRoute);

// Protected routes (API key required)
app.use("/venues", apiKeyAuth);
app.use("/availability", apiKeyAuth);
app.use("/refresh", apiKeyAuth);
app.route("/venues", venuesRoute);
app.route("/availability", availabilityRoute);
app.route("/refresh", refreshRoute);

// Root route
app.get("/", (c) => {
  return c.json({
    name: "courtfinder-akl",
    version: "1.0.0",
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

// Start server
const port = config.port;
console.log(`[Server] Starting courtfinder-akl on port ${port}...`);
console.log(`[Server] Environment: ${config.nodeEnv}`);

// Start the HTTP server
serve({
  fetch: app.fetch,
  port,
});

console.log(`[Server] HTTP server listening on http://localhost:${port}`);

// Run initial data refresh and start scheduler
(async () => {
  await initialRefresh();
  startScheduler();
})();

// Handle graceful shutdown
process.on("SIGTERM", () => {
  console.log("[Server] SIGTERM received, shutting down gracefully...");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("[Server] SIGINT received, shutting down gracefully...");
  process.exit(0);
});
