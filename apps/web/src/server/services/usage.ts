import {
  type MonthlyUsage,
  monthStart,
  nextMonthStart,
  plans,
  remainingThisMonth,
} from "@holler/core";
import { and, eq, gte, isNotNull, sql } from "@holler/core/db";
import { schema } from "../db";
import { type ServiceContext, ServiceError } from "./context";

const { hollers, workspaces } = schema;

/** The workspace's plan and how many hollers it sent this calendar month. */
export async function monthlyUsage(ctx: ServiceContext): Promise<MonthlyUsage> {
  const workspace = await ctx.db.query.workspaces.findFirst({
    where: eq(workspaces.id, ctx.workspaceId),
    columns: { plan: true },
  });
  if (!workspace) throw new ServiceError("not_found", "This workspace no longer exists.");
  const [row] = await ctx.db
    .select({ n: sql<number>`count(*)` })
    .from(hollers)
    .where(
      and(
        eq(hollers.workspaceId, ctx.workspaceId),
        isNotNull(hollers.sentAt),
        gte(hollers.sentAt, monthStart(ctx.now())),
      ),
    );
  return { plan: workspace.plan, sentThisMonth: Number(row?.n ?? 0) };
}

/** This month's usage as every door reports it. Team has no limit, so both numbers are null. */
export async function usageSummary(
  ctx: ServiceContext,
): Promise<MonthlyUsage & { monthlyLimit: number | null; remaining: number | null }> {
  const usage = await monthlyUsage(ctx);
  return {
    ...usage,
    monthlyLimit: finiteOrNull(plans[usage.plan].monthlyHollers),
    remaining: finiteOrNull(remainingThisMonth(usage)),
  };
}

const finiteOrNull = (n: number) => (Number.isFinite(n) ? n : null);

/** Throws limit_reached when Free has used this month's hollers. Call before a send. */
export async function assertCanSend(ctx: ServiceContext): Promise<void> {
  const usage = await monthlyUsage(ctx);
  if (remainingThisMonth(usage) > 0) return;
  const resets = nextMonthStart(ctx.now()).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  throw new ServiceError(
    "limit_reached",
    `Free sends ${plans.free.monthlyHollers} hollers a month, and this workspace has sent them. Upgrade to Team, or send again on ${resets}.`,
  );
}
