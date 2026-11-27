import { Hono } from "hono";
import type { AppEnv } from "../app";
import { getReport } from "../services/sharing";

export const reportRoutes = new Hono<AppEnv>().get("/:token", async (c) => {
  const report = await getReport(c.get("db"), c.req.param("token"), c.get("now")());
  c.header("cache-control", "no-store");
  c.header("x-robots-tag", "noindex");
  return c.json(report);
});
