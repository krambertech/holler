import { newId, plans } from "@holler/core";
import { eq } from "@holler/core/db";
import type { models, webhooks } from "@polar-sh/sdk/2026-10";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuth } from "../auth";
import { type Db, schema } from "../db";
import type { Bindings } from "../env";
import { testDb } from "../test-db";
import {
  applyPolarEvent,
  billingOverview,
  openPortal,
  type PolarGateway,
  startCheckout,
} from "./billing";
import type { ServiceContext } from "./context";
import { workspaceFixture } from "./fixtures";

let db: Db;
let dispose: () => Promise<void>;
beforeAll(async () => ({ db, dispose } = await testDb()));
afterAll(() => dispose());

const periodEnd = "2026-12-20T10:00:00.000Z";

function subscriptionEvent(
  type: webhooks.WebhookPayload["type"],
  workspaceId: string,
  sub: Partial<models.Subscription> & { modified_at: string },
): webhooks.WebhookPayload {
  const data = {
    id: `sub_${workspaceId}`,
    created_at: "2026-11-20T10:00:00.000Z",
    status: "active",
    cancel_at_period_end: false,
    current_period_end: periodEnd,
    ends_at: null,
    customer_id: "cus_1",
    metadata: {},
    customer: { external_id: workspaceId },
    ...sub,
  };
  return { type, timestamp: sub.modified_at, data } as unknown as webhooks.WebhookPayload;
}

async function workspaceRow(workspaceId: string) {
  const row = await db.query.workspaces.findFirst({
    where: eq(schema.workspaces.id, workspaceId),
  });
  if (!row) throw new Error("workspace missing");
  return row;
}

async function planChanges(workspaceId: string) {
  return db.query.activity.findMany({
    where: eq(schema.activity.workspaceId, workspaceId),
    orderBy: (a, { asc }) => [asc(a.at)],
  });
}

const deps = (now: Date) => ({ db, now: () => now });

describe("Polar webhooks", () => {
  it("upgrades to Team when the subscription becomes active, and records it", async () => {
    const { workspaceId, now } = await workspaceFixture(db);
    const outcome = await applyPolarEvent(
      deps(now),
      subscriptionEvent("subscription.active", workspaceId, {
        modified_at: "2026-11-20T10:00:01.000Z",
      }),
    );
    expect(outcome).toBe("applied");
    expect(await workspaceRow(workspaceId)).toMatchObject({
      plan: "team",
      polarCustomerId: "cus_1",
      polarSubscriptionId: `sub_${workspaceId}`,
      planEndsAt: null,
    });
    const activity = await planChanges(workspaceId);
    expect(activity).toHaveLength(1);
    expect(activity[0]).toMatchObject({
      action: "plan.changed",
      via: "system",
      subjectType: "workspace",
      subjectId: workspaceId,
      data: { from: "free", to: "team", endsAt: null },
    });
  });

  it("keeps Team until the period ends after a cancellation, then lapses to Free", async () => {
    const { workspaceId, now } = await workspaceFixture(db);
    await applyPolarEvent(
      deps(now),
      subscriptionEvent("subscription.active", workspaceId, {
        modified_at: "2026-11-20T10:00:01.000Z",
      }),
    );

    await applyPolarEvent(
      deps(now),
      subscriptionEvent("subscription.canceled", workspaceId, {
        modified_at: "2026-11-25T09:00:00.000Z",
        cancel_at_period_end: true,
        ends_at: periodEnd,
      }),
    );
    const cancelled = await workspaceRow(workspaceId);
    expect(cancelled.plan).toBe("team");
    expect(cancelled.planEndsAt?.toISOString()).toBe(periodEnd);

    await applyPolarEvent(
      deps(now),
      subscriptionEvent("subscription.revoked", workspaceId, {
        modified_at: periodEnd,
        status: "canceled",
        cancel_at_period_end: true,
        ends_at: periodEnd,
      }),
    );
    expect(await workspaceRow(workspaceId)).toMatchObject({
      plan: "free",
      polarCustomerId: "cus_1",
      polarSubscriptionId: null,
      planEndsAt: null,
    });
    const activity = await planChanges(workspaceId);
    expect(activity.map((a) => a.data)).toEqual([
      expect.objectContaining({ from: "free", to: "team", endsAt: null }),
      expect.objectContaining({ from: "team", to: "team", endsAt: periodEnd }),
      expect.objectContaining({ from: "team", to: "free", endsAt: null }),
    ]);
  });

  it("does nothing the second time Polar delivers the same event", async () => {
    const { workspaceId, now } = await workspaceFixture(db);
    const event = subscriptionEvent("subscription.active", workspaceId, {
      modified_at: "2026-11-20T10:00:01.000Z",
    });
    expect(await applyPolarEvent(deps(now), event)).toBe("applied");
    expect(await applyPolarEvent(deps(now), event)).toBe("replayed");
    expect(await planChanges(workspaceId)).toHaveLength(1);
  });

  it("skips an older event that arrives after a newer one", async () => {
    const { workspaceId, now } = await workspaceFixture(db);
    await applyPolarEvent(
      deps(now),
      subscriptionEvent("subscription.revoked", workspaceId, {
        modified_at: "2026-11-21T10:00:00.000Z",
        status: "canceled",
      }),
    );
    const late = await applyPolarEvent(
      deps(now),
      subscriptionEvent("subscription.active", workspaceId, {
        modified_at: "2026-11-20T10:00:01.000Z",
      }),
    );
    expect(late).toBe("stale");
    expect((await workspaceRow(workspaceId)).plan).toBe("free");
  });

  it("records no change when a second event repeats the same state", async () => {
    const { workspaceId, now } = await workspaceFixture(db);
    const at = "2026-11-20T10:00:01.000Z";
    await applyPolarEvent(
      deps(now),
      subscriptionEvent("subscription.created", workspaceId, { modified_at: at }),
    );
    expect(
      await applyPolarEvent(
        deps(now),
        subscriptionEvent("subscription.active", workspaceId, { modified_at: at }),
      ),
    ).toBe("unchanged");
    expect(await planChanges(workspaceId)).toHaveLength(1);
  });

  it("leaves Team alone when an older subscription ends after a newer one started", async () => {
    const { workspaceId, now } = await workspaceFixture(db);
    await applyPolarEvent(
      deps(now),
      subscriptionEvent("subscription.active", workspaceId, {
        id: `sub_new_${workspaceId}`,
        modified_at: "2026-11-20T10:00:01.000Z",
      }),
    );
    await applyPolarEvent(
      deps(now),
      subscriptionEvent("subscription.revoked", workspaceId, {
        id: `sub_old_${workspaceId}`,
        modified_at: "2026-11-21T10:00:00.000Z",
        status: "canceled",
      }),
    );
    expect(await workspaceRow(workspaceId)).toMatchObject({
      plan: "team",
      polarSubscriptionId: `sub_new_${workspaceId}`,
    });
  });

  it("waits for payment on an incomplete subscription", async () => {
    const { workspaceId, now } = await workspaceFixture(db);
    expect(
      await applyPolarEvent(
        deps(now),
        subscriptionEvent("subscription.created", workspaceId, {
          modified_at: "2026-11-20T10:00:01.000Z",
          status: "incomplete",
        }),
      ),
    ).toBe("unchanged");
    expect((await workspaceRow(workspaceId)).plan).toBe("free");
  });

  it("ignores events that are not about a subscription or name no workspace", async () => {
    const { now } = await workspaceFixture(db);
    const order = { type: "order.paid", data: {} } as unknown as webhooks.WebhookPayload;
    expect(await applyPolarEvent(deps(now), order)).toBe("ignored");
    expect(
      await applyPolarEvent(
        deps(now),
        subscriptionEvent("subscription.active", "wsp_unknown", {
          modified_at: "2026-11-20T10:00:01.000Z",
        }),
      ),
    ).toBe("ignored");
  });

  it("finds the workspace in the subscription metadata when the customer has no external id", async () => {
    const { workspaceId, now } = await workspaceFixture(db);
    await applyPolarEvent(
      deps(now),
      subscriptionEvent("subscription.active", workspaceId, {
        modified_at: "2026-11-20T10:00:01.000Z",
        customer: { external_id: null } as models.SubscriptionCustomer,
        metadata: { workspaceId },
      }),
    );
    expect((await workspaceRow(workspaceId)).plan).toBe("team");
  });
});

class FakePolar implements PolarGateway {
  checkouts: Parameters<PolarGateway["createCheckout"]>[0][] = [];
  portals: string[] = [];
  async createCheckout(input: Parameters<PolarGateway["createCheckout"]>[0]) {
    this.checkouts.push(input);
    return "https://sandbox.polar.sh/checkout/c_1";
  }
  async createPortalSession(input: { workspaceId: string }) {
    this.portals.push(input.workspaceId);
    return "https://sandbox.polar.sh/portal/s_1";
  }
}

async function addSender(ctx: ServiceContext): Promise<ServiceContext> {
  const memberId = newId("member");
  const userId = crypto.randomUUID();
  const now = ctx.now();
  await db.batch([
    db.insert(schema.user).values({
      id: userId,
      name: "Sender",
      email: `${userId}@test.local`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    }),
    db.insert(schema.members).values({
      id: memberId,
      workspaceId: ctx.workspaceId,
      userId,
      slackUserId: "UA",
      role: "sender",
    }),
  ]);
  return { ...ctx, actor: { via: "web", memberId, slackUserId: "UA" } };
}

const urls = {
  successUrl: "http://localhost/settings?checkout={CHECKOUT_ID}",
  returnUrl: "http://localhost/settings",
};

describe("billing for members", () => {
  it("shows a sender the plan, the limit and which owner to ask", async () => {
    const { ctx } = await workspaceFixture(db);
    const sender = await addSender(ctx);
    expect(await billingOverview(sender)).toMatchObject({
      plan: "free",
      sentThisMonth: 0,
      monthlyLimit: plans.free.monthlyHollers,
      resetsAt: "2026-12-01T00:00:00.000Z",
      canManage: false,
      hasBillingAccount: false,
      owners: [{ name: "Person ULEAD" }],
    });
    expect(await billingOverview(ctx)).toMatchObject({ canManage: true, owners: [] });
  });

  it("starts a checkout for the workspace, not the person, and only for owners", async () => {
    const { ctx, workspaceId } = await workspaceFixture(db);
    const polar = new FakePolar();
    await expect(startCheckout(ctx, polar, urls)).resolves.toEqual({
      url: "https://sandbox.polar.sh/checkout/c_1",
    });
    expect(polar.checkouts[0]).toMatchObject({ workspaceId, workspaceName: "Test" });
    expect(polar.checkouts[0]?.email).toMatch(/@test\.local$/);

    const sender = await addSender(ctx);
    await expect(startCheckout(sender, polar, urls)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("says billing is not set up when Polar is not configured", async () => {
    const { ctx } = await workspaceFixture(db);
    await expect(startCheckout(ctx, null, urls)).rejects.toMatchObject({ code: "conflict" });
  });

  it("opens the portal once Polar knows the workspace", async () => {
    const { ctx, workspaceId, now } = await workspaceFixture(db);
    const polar = new FakePolar();
    await expect(openPortal(ctx, polar, urls.returnUrl)).rejects.toMatchObject({
      code: "conflict",
    });
    await applyPolarEvent(
      deps(now),
      subscriptionEvent("subscription.active", workspaceId, {
        modified_at: "2026-11-20T10:00:01.000Z",
      }),
    );
    await expect(openPortal(ctx, polar, urls.returnUrl)).resolves.toEqual({
      url: "https://sandbox.polar.sh/portal/s_1",
    });
    expect(polar.portals).toEqual([workspaceId]);
    await expect(startCheckout(ctx, polar, urls)).rejects.toMatchObject({ code: "conflict" });
  });
});

describe("the Polar webhook endpoint", () => {
  const secret = "polar-test-webhook-secret";

  function authFor() {
    const kv = new Map<string, string>();
    const env = {
      PRODUCT_URL: "http://localhost:5280",
      BETTER_AUTH_SECRET: "test-secret-at-least-thirty-two-characters-long",
      DEV_ROUTES: "false",
      POLAR_ACCESS_TOKEN: "polar_oat_test",
      POLAR_WEBHOOK_SECRET: secret,
      POLAR_TEAM_MONTHLY_PRODUCT_ID: "prod_team_monthly",
      SESSIONS: {
        get: async (key: string) => kv.get(key) ?? null,
        put: async (key: string, value: string) => void kv.set(key, value),
        delete: async (key: string) => void kv.delete(key),
      },
    } as unknown as Bindings;
    return createAuth(env, db);
  }

  async function signed(body: string, signWith = secret) {
    const id = `msg_${crypto.randomUUID()}`;
    const timestamp = String(Math.floor(Date.now() / 1000));
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(signWith),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const mac = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${id}.${timestamp}.${body}`),
    );
    const signature = btoa(String.fromCharCode(...new Uint8Array(mac)));
    return new Request("http://localhost:5280/api/auth/polar/webhooks", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "webhook-id": id,
        "webhook-timestamp": timestamp,
        "webhook-signature": `v1,${signature}`,
      },
      body,
    });
  }

  it("applies a correctly signed event and refuses a forged one", async () => {
    const { workspaceId } = await workspaceFixture(db);
    const now = new Date().toISOString();
    const subscription = {
      id: `sub_${workspaceId}`,
      created_at: now,
      modified_at: now,
      amount: 2000,
      currency: "eur",
      recurring_interval: "month",
      recurring_interval_count: 1,
      status: "active",
      current_period_start: now,
      current_period_end: periodEnd,
      current_meter_period_start: null,
      current_meter_period_end: null,
      trial_start: null,
      trial_end: null,
      cancel_at_period_end: false,
      canceled_at: null,
      started_at: now,
      ends_at: null,
      ended_at: null,
      pause_at_period_end: false,
      paused_at: null,
      resumes_at: null,
      customer_id: "cus_1",
      product_id: "prod_team",
      discount_id: null,
      checkout_id: null,
      units: null,
      customer_cancellation_reason: null,
      customer_cancellation_comment: null,
      metadata: { workspaceId },
      customer: {
        id: "cus_1",
        created_at: now,
        modified_at: null,
        metadata: {},
        external_id: workspaceId,
        email: "owner@test.local",
        email_verified: true,
        type: "team",
        name: "Test",
        billing_address: null,
        tax_id: null,
        organization_id: "org_1",
        deleted_at: null,
        avatar_url: "https://example.com/a.png",
      },
      product: {},
      discount: null,
      prices: [],
      meters: [],
    };
    const body = JSON.stringify({
      type: "subscription.active",
      timestamp: now,
      data: subscription,
    });
    const auth = authFor();

    const forged = await auth.handler(await signed(body, "not-the-secret"));
    expect(forged.status).toBe(403);
    expect((await workspaceRow(workspaceId)).plan).toBe("free");

    const genuine = await auth.handler(await signed(body));
    expect(genuine.status).toBe(200);
    expect((await workspaceRow(workspaceId)).plan).toBe("team");
  });
});
