import { Hono } from "hono";
import type { AppEnv } from "../app";
import { installStatus } from "../services/workspaces";

export const installRoutes = new Hono<AppEnv>().get("/status", async (c) => {
  const session = await c.get("auth").api.getSession({ headers: c.req.raw.headers });
  return c.json(await installStatus(c.get("db"), session?.user.id ?? null));
});
