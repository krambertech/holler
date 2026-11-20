import { Hono } from "hono";
import type { AppEnv } from "../app";

/** Which Worker version answers, so a deploy can be checked against the commit it should be. */
export const healthRoutes = new Hono<AppEnv>().get("/", (c) =>
  c.json({
    ok: true,
    worker: "holler",
    version: c.env.CF_VERSION_METADATA?.id ?? "local",
    tag: c.env.CF_VERSION_METADATA?.tag ?? null,
  }),
);
