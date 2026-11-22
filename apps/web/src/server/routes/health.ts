import { Hono } from "hono";
import type { AppEnv } from "../app";
import { overdueWork } from "../services/overdue";

/** Which Worker version answers, so a deploy can be checked against the commit it should be. */
export const healthRoutes = new Hono<AppEnv>()
  .get("/", (c) =>
    c.json({
      ok: true,
      worker: "holler",
      version: c.env.CF_VERSION_METADATA?.id ?? "local",
      tag: c.env.CF_VERSION_METADATA?.tag ?? null,
    }),
  )
  .get("/work", async (c) => {
    const overdue = await overdueWork(c.get("db"), c.get("now")());
    return c.json({ ok: overdue.length === 0, overdue }, overdue.length === 0 ? 200 : 503);
  });
