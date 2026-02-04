import { Hono } from "hono";
import { VENUES } from "../config";
import type { VenuesResponse } from "../types";

const venues = new Hono();

venues.get("/", (c) => {
  const response: VenuesResponse = {
    venues: VENUES,
  };

  return c.json(response);
});

export default venues;
