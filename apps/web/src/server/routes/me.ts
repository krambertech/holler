import { plans, remainingThisMonth } from "@holler/core";
import { Hono } from "hono";
import type { AppEnv } from "../app";
import { describeMe } from "../services/members";
import { monthlyUsage } from "../services/usage";
import { requireMember } from "./context";

export const meRoutes = new Hono<AppEnv>().get("/", async (c) => {
  const ctx = requireMember(c);
  const [me, usage] = await Promise.all([describeMe(ctx), monthlyUsage(ctx)]);
  const remaining = remainingThisMonth(usage);
  return c.json({
    ...me,
    usage: {
      plan: usage.plan,
      sentThisMonth: usage.sentThisMonth,
      monthlyLimit: Number.isFinite(plans[usage.plan].monthlyHollers)
        ? plans[usage.plan].monthlyHollers
        : null,
      remaining: Number.isFinite(remaining) ? remaining : null,
    },
  });
});
