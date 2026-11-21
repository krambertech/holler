import { Hono } from "hono";
import type { AppEnv } from "../app";
import { describeMe } from "../services/members";
import { usageSummary } from "../services/usage";
import { requireMember } from "./context";

export const meRoutes = new Hono<AppEnv>().get("/", async (c) => {
  const ctx = requireMember(c);
  const [me, usage] = await Promise.all([describeMe(ctx), usageSummary(ctx)]);
  return c.json({ ...me, usage });
});
