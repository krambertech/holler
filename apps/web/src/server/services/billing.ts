import { type BillingOverview, nextMonthStart, plans } from "@holler/core";
import { and, eq, gt } from "@holler/core/db";
import { createPolarCore, type models, type webhooks } from "@polar-sh/sdk/2026-10";
import { createCheckouts } from "@polar-sh/sdk/2026-10/services/checkouts";
import { createCustomerSessions } from "@polar-sh/sdk/2026-10/services/customer_sessions";
import { runBatch } from "../batch";
import type { Db } from "../db";
import { schema } from "../db";
import type { Bindings } from "../env";
import { auditStatement } from "./audit";
import { memberOf, type ServiceContext, ServiceError } from "./context";
import { monthlyUsage } from "./usage";

/**
 * The workspace's plan, and the only writer of `workspaces.plan`, `polar_*` and `plan_ends_at`.
 * The Polar customer is the workspace: its external id is the workspace id, so every owner manages
 * the same subscription, whoever bought it. docs/billing.md has the Polar setup.
 */

const { members, polarEvents, slackPeople, user, workspaces } = schema;

// ----- Polar ------------------------------------------------------------------------------------

/** True when this Worker has what it needs to talk to Polar and verify its webhooks. */
export function polarConfigured(env: Bindings): env is Bindings & {
  POLAR_ACCESS_TOKEN: string;
  POLAR_WEBHOOK_SECRET: string;
  POLAR_TEAM_MONTHLY_PRODUCT_ID: string;
} {
  return Boolean(
    env.POLAR_ACCESS_TOKEN && env.POLAR_WEBHOOK_SECRET && env.POLAR_TEAM_MONTHLY_PRODUCT_ID,
  );
}

/** The Polar core client. Sandbox unless POLAR_SERVER is `production`. */
export function polarClient(env: Bindings) {
  return createPolarCore({
    accessToken: env.POLAR_ACCESS_TOKEN ?? "",
    environment: env.POLAR_SERVER === "production" ? "production" : "sandbox",
  });
}

/** The two Polar calls billing makes outside a webhook. Tests pass a fake. */
export interface PolarGateway {
  createCheckout(input: {
    workspaceId: string;
    workspaceName: string;
    slackTeamId: string;
    /** Prefilled only for a workspace Polar has never seen. */
    email: string | null;
    successUrl: string;
    returnUrl: string;
  }): Promise<string>;
  createPortalSession(input: { workspaceId: string; returnUrl: string }): Promise<string>;
}

export function polarGateway(env: Bindings): PolarGateway | null {
  if (!polarConfigured(env)) return null;
  const client = polarClient(env);
  // Monthly first, so the checkout opens on it; the owner can switch to yearly there.
  const products = [env.POLAR_TEAM_MONTHLY_PRODUCT_ID, env.POLAR_TEAM_YEARLY_PRODUCT_ID].filter(
    (id): id is string => Boolean(id),
  );
  return {
    async createCheckout(input) {
      const checkout = await createCheckouts(client)({
        products,
        external_customer_id: input.workspaceId,
        customer_name: input.workspaceName,
        ...(input.email ? { customer_email: input.email } : {}),
        is_business_customer: true,
        metadata: { workspaceId: input.workspaceId },
        customer_metadata: { workspaceId: input.workspaceId, slackTeamId: input.slackTeamId },
        success_url: input.successUrl,
        return_url: input.returnUrl,
      });
      return checkout.url;
    },
    async createPortalSession(input) {
      const session = await createCustomerSessions(client)({
        external_customer_id: input.workspaceId,
        return_url: input.returnUrl,
      });
      return session.customer_portal_url;
    },
  };
}

// ----- Reading ----------------------------------------------------------------------------------

/** What the Billing section of Settings shows, and what the limit message reads. Any member may ask. */
export async function billingOverview(ctx: ServiceContext): Promise<BillingOverview> {
  const memberId = memberOf(ctx);
  const [workspace, me, owners, usage] = await Promise.all([
    ctx.db.query.workspaces.findFirst({ where: eq(workspaces.id, ctx.workspaceId) }),
    ctx.db.query.members.findFirst({ where: eq(members.id, memberId), columns: { role: true } }),
    ctx.db
      .select({ id: members.id, name: slackPeople.name, displayName: slackPeople.displayName })
      .from(members)
      .leftJoin(
        slackPeople,
        and(
          eq(slackPeople.workspaceId, members.workspaceId),
          eq(slackPeople.slackUserId, members.slackUserId),
        ),
      )
      .where(and(eq(members.workspaceId, ctx.workspaceId), eq(members.role, "owner")))
      .orderBy(members.createdAt),
    monthlyUsage(ctx),
  ]);
  if (!workspace) throw new ServiceError("not_found", "This workspace no longer exists.");
  const limit = plans[usage.plan].monthlyHollers;
  return {
    plan: usage.plan,
    planEndsAt: workspace.planEndsAt?.toISOString() ?? null,
    sentThisMonth: usage.sentThisMonth,
    monthlyLimit: Number.isFinite(limit) ? limit : null,
    resetsAt: nextMonthStart(ctx.now()).toISOString(),
    canManage: me?.role === "owner",
    hasBillingAccount: workspace.polarCustomerId != null,
    owners: owners
      .filter((owner) => owner.id !== memberId)
      .map((owner) => ({ name: owner.displayName || owner.name || "A workspace owner" })),
  };
}

// ----- Owner actions ----------------------------------------------------------------------------

async function ownedWorkspace(ctx: ServiceContext) {
  const memberId = memberOf(ctx);
  const [row] = await ctx.db
    .select({ role: members.role, workspace: workspaces, email: user.email })
    .from(members)
    .innerJoin(workspaces, eq(workspaces.id, members.workspaceId))
    .innerJoin(user, eq(user.id, members.userId))
    .where(and(eq(members.id, memberId), eq(members.workspaceId, ctx.workspaceId)));
  if (!row) throw new ServiceError("not_found", "This workspace no longer exists.");
  if (row.role !== "owner") {
    throw new ServiceError(
      "forbidden",
      "Only workspace owners change the plan. Ask an owner to do it.",
    );
  }
  return row;
}

function unavailable(): never {
  throw new ServiceError(
    "conflict",
    "Billing is not set up on this server yet. Add the Polar settings from docs/billing.md.",
  );
}

/** A Polar checkout for Team, with the workspace as the customer. Owners only. */
export async function startCheckout(
  ctx: ServiceContext,
  polar: PolarGateway | null,
  urls: { successUrl: string; returnUrl: string },
): Promise<{ url: string }> {
  const { workspace, email } = await ownedWorkspace(ctx);
  if (workspace.plan === "team" && workspace.planEndsAt == null) {
    throw new ServiceError(
      "conflict",
      "This workspace is already on Team. Use Manage billing to change it.",
    );
  }
  if (!polar) unavailable();
  try {
    const url = await polar.createCheckout({
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      slackTeamId: workspace.slackTeamId,
      email: workspace.polarCustomerId ? null : email,
      ...urls,
    });
    return { url };
  } catch (error) {
    console.error("Polar checkout failed", error);
    throw new ServiceError("conflict", "We could not open the checkout. Try again in a minute.");
  }
}

/** A Polar customer portal session for the workspace: invoices, card, cancel or resume. */
export async function openPortal(
  ctx: ServiceContext,
  polar: PolarGateway | null,
  returnUrl: string,
): Promise<{ url: string }> {
  const { workspace } = await ownedWorkspace(ctx);
  if (!workspace.polarCustomerId) {
    throw new ServiceError(
      "conflict",
      "This workspace has no billing yet. Upgrade to Team to start it.",
    );
  }
  if (!polar) unavailable();
  try {
    return { url: await polar.createPortalSession({ workspaceId: workspace.id, returnUrl }) };
  } catch (error) {
    console.error("Polar portal session failed", error);
    throw new ServiceError("conflict", "We could not open billing. Try again in a minute.");
  }
}

// ----- Webhooks ---------------------------------------------------------------------------------

type BillingState = Pick<
  typeof workspaces.$inferSelect,
  "plan" | "polarCustomerId" | "polarSubscriptionId" | "planEndsAt"
>;

/** Polar keeps a subscription in these while the workspace should have Team. */
const entitled = new Set<models.SubscriptionStatus>(["active", "trialing", "past_due"]);

/**
 * What the workspace's billing should be after Polar reports `sub`. Pure, so the rules read in
 * one place: an entitled subscription gives Team, ending on `ends_at` when it is cancelled at the
 * period end; an incomplete one changes nothing yet; anything else lapses to Free, unless it is an
 * older subscription and a newer one is the workspace's current one.
 */
export function nextBillingState(current: BillingState, sub: models.Subscription): BillingState {
  if (entitled.has(sub.status)) {
    return {
      plan: "team",
      polarCustomerId: sub.customer_id,
      polarSubscriptionId: sub.id,
      planEndsAt: sub.cancel_at_period_end ? new Date(sub.ends_at ?? sub.current_period_end) : null,
    };
  }
  if (sub.status === "incomplete") return current;
  if (current.polarSubscriptionId && current.polarSubscriptionId !== sub.id) return current;
  return {
    plan: "free",
    polarCustomerId: sub.customer_id,
    polarSubscriptionId: null,
    planEndsAt: null,
  };
}

function sameState(a: BillingState, b: BillingState) {
  return (
    a.plan === b.plan &&
    a.polarCustomerId === b.polarCustomerId &&
    a.polarSubscriptionId === b.polarSubscriptionId &&
    (a.planEndsAt?.getTime() ?? null) === (b.planEndsAt?.getTime() ?? null)
  );
}

function workspaceIdOf(sub: models.Subscription): string | null {
  if (sub.customer.external_id) return sub.customer.external_id;
  const fromMetadata = sub.metadata.workspaceId;
  return typeof fromMetadata === "string" ? fromMetadata : null;
}

export type PolarEventOutcome = "applied" | "unchanged" | "stale" | "replayed" | "ignored";

/**
 * Applies one verified Polar webhook. The `@polar-sh/better-auth` webhooks plugin checks the
 * signature before this runs. Polar may repeat or reorder deliveries: a replay is a no-op, and an
 * event older than one already applied for the same subscription is recorded and skipped.
 */
export async function applyPolarEvent(
  deps: { db: Db; now: () => Date },
  event: webhooks.WebhookPayload,
): Promise<PolarEventOutcome> {
  if (!event.type.startsWith("subscription.")) return "ignored";
  const sub = event.data as models.Subscription;
  const workspaceId = workspaceIdOf(sub);
  if (!workspaceId) {
    console.warn(`Polar ${event.type} for ${sub.id} names no workspace; ignored.`);
    return "ignored";
  }
  const { db } = deps;
  const workspace = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });
  if (!workspace) {
    console.warn(`Polar ${event.type} for ${sub.id} names unknown workspace ${workspaceId}.`);
    return "ignored";
  }

  const occurredAt = new Date(sub.modified_at ?? sub.created_at);
  const id = `${event.type}:${sub.id}:${occurredAt.toISOString()}`;
  if (await db.query.polarEvents.findFirst({ where: eq(polarEvents.id, id) })) return "replayed";

  const record = (outcome: "applied" | "unchanged" | "stale") =>
    db
      .insert(polarEvents)
      .values({
        id,
        workspaceId,
        subscriptionId: sub.id,
        type: event.type,
        occurredAt,
        outcome,
        receivedAt: deps.now(),
      })
      .onConflictDoNothing();

  const newer = await db.query.polarEvents.findFirst({
    where: and(eq(polarEvents.subscriptionId, sub.id), gt(polarEvents.occurredAt, occurredAt)),
    columns: { id: true },
  });
  if (newer) {
    await record("stale");
    return "stale";
  }

  const next = nextBillingState(workspace, sub);
  if (sameState(workspace, next)) {
    await record("unchanged");
    return "unchanged";
  }

  const ctx: ServiceContext = { db, workspaceId, actor: { via: "system" }, now: deps.now };
  await runBatch(db, [
    db.update(workspaces).set(next).where(eq(workspaces.id, workspaceId)),
    auditStatement(ctx, {
      action: "plan.changed",
      subjectType: "workspace",
      subjectId: workspaceId,
      data: {
        from: workspace.plan,
        to: next.plan,
        endsAt: next.planEndsAt?.toISOString() ?? null,
        polarEvent: event.type,
        polarSubscriptionId: sub.id,
      },
    }),
    record("applied"),
  ]);
  return "applied";
}
