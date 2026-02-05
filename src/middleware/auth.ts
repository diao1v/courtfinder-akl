import type { Context, Next } from "hono";
import type { Env } from "../env";

/**
 * API key authentication middleware
 * Checks for X-API-Key header matching configured API key
 */
export async function apiKeyAuth(
  c: Context<{ Bindings: Env }>,
  next: Next
): Promise<Response | void> {
  const apiKey = c.req.header("X-API-Key");

  if (!apiKey || apiKey !== c.env.API_KEY) {
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
