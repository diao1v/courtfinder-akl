import type { Context, Next } from "hono";
import { config } from "../config";

/**
 * API key authentication middleware
 * Checks for X-API-Key header matching configured API key
 */
export async function apiKeyAuth(c: Context, next: Next) {
  const apiKey = c.req.header("X-API-Key");

  if (!apiKey || apiKey !== config.apiKey) {
    return c.json(
      {
        error: "UNAUTHORIZED",
        message: "Invalid or missing API key",
      },
      401
    );
  }

  await next();
}
