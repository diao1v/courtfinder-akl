import { Hono } from "hono";
import { VENUES } from "../config";
import type { VenuesResponse } from "../types";
import type { Env } from "../env";

const venues = new Hono<{ Bindings: Env }>();

venues.get("/", (c) => {
  const response: VenuesResponse = {
    venues: VENUES,
  };

  return c.json(response);
});

export default venues;
