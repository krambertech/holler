import type { HollerDraftInput } from "@holler/core";
import { eq } from "@holler/core/db";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import type { models, webhooks } from "@polar-sh/sdk/2026-10";
import { inspectRoutes } from "hono/dev";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "./app";
import { type Db, schema } from "./db";
import type { Bindings } from "./env";
import { buildMcpServer } from "./mcp/server";
import { testEnv } from "./routes/v1/test-env";
import { addNoteFromSlack } from "./services/answering";
import { createApiKey } from "./services/api-keys";
import { applyPolarEvent } from "./services/billing";
import type { ServiceContext } from "./services/context";
import { remindWaiting, sendDueHollers, sendHoller } from "./services/delivery";
import { workspaceFixture } from "./services/fixtures";
import { createDraft } from "./services/hollers";
import { closeDueHollers } from "./services/lifecycle";
import { ensureMember } from "./services/members";
import { snoozeReminder } from "./services/reminders";
import { recordResponse } from "./services/responses";
import { nextRound } from "./services/rounds";
import { sendConfirmToken } from "./services/send-preview";
import { addViewers, makeReportLink } from "./services/sharing";
import { grantFor, slackUser, TEST_TOKEN_KEY } from "./services/slack-fixtures";
import { completeInstall, markUninstalled } from "./services/workspaces";
import { FakeSlack } from "./slack/fake";
import { deliveryEnv, emptyDatabase } from "./test-delivery";

type Act = () => Promise<unknown>;

interface Proof {
  action: string;
  eachCallChanges?: true;
  arrange: () => Promise<Act>;
}

interface World {
  ctx: ServiceContext;
  env: Bindings;
  queued: { kind: string }[];
  drain: (at: Date) => Promise<void>;
}

const HOUR = 3_600_000;
const origin = "http://localhost:5280";

let testing: Awaited<ReturnType<typeof testEnv>>;
let db: Db;
let raw: D1Database;
let cookie: string;
let userId: string;
let world: World;

beforeAll(async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  testing = await testEnv();
  db = testing.db;
  raw = testing.env.DB;
  const signedUp = await testing.auth.api.signUpEmail({
    body: { email: "lead@test.local", password: "a-password-for-tests", name: "Lead" },
    asResponse: true,
  });
  cookie = signedUp.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  userId = ((await signedUp.json()) as { user: { id: string } }).user.id;
});
afterAll(() => testing.dispose());

beforeEach(async () => {
  await raw.prepare("drop trigger if exists refuse_activity").run();
  await emptyDatabase(raw);
  const { ctx, workspaceId, memberId } = await workspaceFixture(db);
  await db.batch([
    db.update(schema.members).set({ userId }).where(eq(schema.members.id, memberId)),
    db.update(schema.workspaces).set({ plan: "team" }).where(eq(schema.workspaces.id, workspaceId)),
  ]);
  const { env, queued, drain } = deliveryEnv(db, raw);
  world = {
    ctx: { ...ctx, now: () => new Date() },
    env: { ...testing.env, SLACK_SENDS: env.SLACK_SENDS },
    queued,
    drain,
  };
});

const pulse = {
  mode: "pulse",
  title: "How was your week?",
  audience: { people: ["UA", "UB"], groups: [], everyone: false },
  questions: [
    {
      type: "single",
      prompt: "How was it?",
      options: [{ label: "Fine" }, { label: "Great" }],
      followUp: { prompt: "Why?", onlyAfter: null },
    },
  ],
} satisfies HollerDraftInput;

const draft = async (over: Partial<HollerDraftInput> = {}) =>
  (await createDraft(world.ctx, { ...pulse, ...over })).id;

async function live(over: Partial<HollerDraftInput> = {}) {
  const id = await draft(over);
  await sendHoller(world.ctx, world.env, id);
  await world.drain(new Date());
  return id;
}

const inAnHour = () => new Date(Date.now() + HOUR);
const weekly = () => draft({ repeat: "week", closeAfterHours: 48, sendAt: inAnHour() });
const recipient = (slackUserId: string): ServiceContext => ({
  ...world.ctx,
  actor: { via: "slack", recipientSlackUserId: slackUserId },
});

async function call(method: string, path: string, body?: unknown) {
  const response = await app.request(
    `${origin}${path}`,
    {
      method,
      headers: { cookie, origin, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    world.env,
  );
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status}`);
}

async function mcpClient() {
  const actor = {
    via: "mcp" as const,
    memberId: "",
    slackUserId: "ULEAD",
    credentialId: "client-1",
    ...("memberId" in world.ctx.actor ? { memberId: world.ctx.actor.memberId ?? "" } : {}),
  };
  const ctx = { ...world.ctx, actor };
  const server = buildMcpServer({
    principal: {
      userId,
      memberId: actor.memberId,
      workspaceId: ctx.workspaceId,
      slackUserId: "ULEAD",
      role: "owner",
      actor,
      scope: "write",
    },
    ctx,
    env: world.env,
    resourceMetadataUrl: `${origin}/.well-known/oauth-protected-resource/mcp`,
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1.0.0" });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return { client, ctx };
}

async function tool(name: string, args: Record<string, unknown>) {
  const { client } = await mcpClient();
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) throw new Error(`${name}: ${JSON.stringify(result.content)}`);
}

async function confirmFor(hollerId: string) {
  const { ctx } = await mcpClient();
  return sendConfirmToken(ctx, world.env.BETTER_AUTH_SECRET, hollerId);
}

const proof = (
  action: string,
  given: () => Promise<string>,
  act: (id: string) => Promise<unknown>,
  eachCallChanges?: true,
): Proof => ({
  action,
  ...(eachCallChanges ? { eachCallChanges } : {}),
  arrange: async () => {
    const id = await given();
    return () => act(id);
  },
});

const nothing = async () => "";

const hollerRoutes = (base: string): Record<string, Proof> => ({
  [`POST ${base}`]: proof("holler.created", nothing, () => call("POST", base, pulse), true),
  [`DELETE ${base}/:id`]: proof("holler.deleted", draft, (id) => call("DELETE", `${base}/${id}`)),
  [`POST ${base}/:id/copy`]: proof(
    "holler.copied",
    draft,
    (id) => call("POST", `${base}/${id}/copy`),
    true,
  ),
  [`POST ${base}/:id/send`]: proof("holler.sent", draft, (id) =>
    call("POST", `${base}/${id}/send`),
  ),
  [`POST ${base}/:id/close`]: proof("holler.closed", live, (id) =>
    call("POST", `${base}/${id}/close`),
  ),
  [`POST ${base}/:id/stop-repeating`]: proof("holler.repeat_stopped", weekly, (id) =>
    call("POST", `${base}/${id}/stop-repeating`),
  ),
  [`POST ${base}/:id/remind`]: proof("holler.reminded", live, (id) =>
    call("POST", `${base}/${id}/remind`),
  ),
});

async function sharedWithUA() {
  const id = await live();
  await addViewers(world.ctx, world.env, id, { slackUserIds: ["UA"] });
  return id;
}

async function withReportLink() {
  const id = await live();
  await makeReportLink(world.ctx, world.env, id);
  return id;
}

async function colleague() {
  const { userId: theirs } = await slackUser(db, { slackUserId: "UA", teamId: "T" });
  const member = await ensureMember(
    db,
    { workspaceId: world.ctx.workspaceId, userId: theirs, slackUserId: "UA" },
    new Date(),
  );
  return member.id;
}

async function apiKeyOfMine() {
  const { id } = await createApiKey(world.ctx, testing.auth, { name: "Deploys", scope: "write" });
  return id;
}

async function appOfMine() {
  const id = crypto.randomUUID();
  const now = new Date();
  await db.batch([
    db.insert(schema.oauthClient).values({ id, clientId: id, redirectUris: [] }),
    db.insert(schema.oauthConsent).values({
      id,
      clientId: id,
      userId,
      referenceId: "memberId" in world.ctx.actor ? world.ctx.actor.memberId : null,
      scopes: ["read"],
      createdAt: now,
      updatedAt: now,
    }),
  ]);
  return id;
}

const routeProofs: Record<string, Proof> = {
  ...hollerRoutes("/api/hollers"),
  ...hollerRoutes("/api/v1/hollers"),
  "PUT /api/settings/members/:id/role": proof("member.role_changed", colleague, (id) =>
    call("PUT", `/api/settings/members/${id}/role`, { role: "owner" }),
  ),
  "POST /api/v1/keys": proof(
    "api_key.created",
    nothing,
    () => call("POST", "/api/v1/keys", { name: "Deploys", scope: "read" }),
    true,
  ),
  "DELETE /api/v1/keys/:id": proof("api_key.revoked", apiKeyOfMine, (id) =>
    call("DELETE", `/api/v1/keys/${id}`),
  ),
  "DELETE /api/v1/connected-apps/:id": proof("connected_app.disconnected", appOfMine, (id) =>
    call("DELETE", `/api/v1/connected-apps/${id}`),
  ),
  "PUT /api/hollers/:id/visibility": proof("holler.visibility_changed", live, (id) =>
    call("PUT", `/api/hollers/${id}/visibility`, { visibility: "workspace" }),
  ),
  "POST /api/hollers/:id/viewers": proof("viewer.added", live, (id) =>
    call("POST", `/api/hollers/${id}/viewers`, { slackUserIds: ["UA"] }),
  ),
  "DELETE /api/hollers/:id/viewers/:slackUserId": proof("viewer.removed", sharedWithUA, (id) =>
    call("DELETE", `/api/hollers/${id}/viewers/UA`),
  ),
  "POST /api/hollers/:id/report-link": proof("report_link.made", live, (id) =>
    call("POST", `/api/hollers/${id}/report-link`),
  ),
  "DELETE /api/hollers/:id/report-link": proof("report_link.turned_off", withReportLink, (id) =>
    call("DELETE", `/api/hollers/${id}/report-link`),
  ),
};

const unrecordedRoutes: Record<string, string> = {
  "PUT /api/hollers/:id": "a draft saves itself while it is written; its send is recorded",
  "PUT /api/v1/hollers/:id": "a draft saves itself while it is written; its send is recorded",
  "POST /api/respond/:id": "an answer is the response itself, and Activity never says who answered",
  "POST /api/billing/checkout":
    "opens Polar; its webhook changes the plan, through applyPolarEvent",
  "POST /api/billing/portal": "opens Polar; its webhook changes the plan, through applyPolarEvent",
  "POST /api/auth/*": "Better Auth's own tables; a first sign-in is recorded by ensureMember",
  "POST /api/dev/tick": "development and browser tests only",
  "POST /api/dev/web-survey": "development and browser tests only",
  "POST /api/dev/answer": "development and browser tests only",
  "POST /api/dev/slack": "development and browser tests only",
  "POST /slack/events": "hands over to markUninstalled, proven below, and to sends and answers",
  "POST /slack/commands": "opens the quick pulse or answers in place, and writes nothing",
  "POST /slack/interactions":
    "hands over to snoozeReminder and addNoteFromSlack, proven below, and to createDraft, sendHoller and remindWaiting, proven by their routes",
  "ALL /mcp": "every tool is proven below",
  "ALL /api/*": "answers 404",
  "ALL /*": "serves the web app's files",
};

const toolProofs: Record<string, Proof> = {
  create_holler: proof("holler.created", nothing, () => tool("create_holler", pulse), true),
  copy_holler: proof("holler.copied", draft, (hollerId) => tool("copy_holler", { hollerId }), true),
  delete_draft: proof("holler.deleted", draft, (hollerId) => tool("delete_draft", { hollerId })),
  send_holler: proof("holler.sent", draft, async (hollerId) =>
    tool("send_holler", { hollerId, confirm: await confirmFor(hollerId) }),
  ),
  close_holler: proof("holler.closed", live, (hollerId) => tool("close_holler", { hollerId })),
  stop_repeating: proof("holler.repeat_stopped", weekly, (hollerId) =>
    tool("stop_repeating", { hollerId }),
  ),
  send_reminder: proof("holler.reminded", live, (hollerId) => tool("send_reminder", { hollerId })),
};

const unrecordedTools: Record<string, string> = {
  update_holler: "a draft saves itself while it is written; its send is recorded",
};

const install = (teamId: string) =>
  completeInstall(db, {
    grant: grantFor({ teamId }),
    slack: new FakeSlack(),
    tokenKey: TEST_TOKEN_KEY,
    now: new Date(0),
  });

async function installed() {
  const teamId = `T${crypto.randomUUID()}`;
  await install(teamId);
  return teamId;
}

const serviceProofs: Record<string, Proof> = {
  "a send time ahead schedules the Holler": proof(
    "holler.scheduled",
    () => draft({ sendAt: inAnHour() }),
    (id) => sendHoller(world.ctx, world.env, id),
  ),
  "the cron sends a Holler that is due": proof(
    "holler.sent",
    async () => {
      const id = await draft({ sendAt: inAnHour() });
      await sendHoller(world.ctx, world.env, id);
      return id;
    },
    () => sendDueHollers(world.env, db, new Date(Date.now() + 2 * HOUR)),
  ),
  "the cron puts a Holler it cannot send back to draft": proof(
    "holler.send_failed",
    async () => {
      const id = await draft({ sendAt: inAnHour() });
      await sendHoller(world.ctx, world.env, id);
      await db.update(schema.hollers).set({ title: "" }).where(eq(schema.hollers.id, id));
      await db.delete(schema.questions).where(eq(schema.questions.hollerId, id));
      return id;
    },
    () => sendDueHollers(world.env, db, new Date(Date.now() + 2 * HOUR)),
  ),
  "the cron closes a Holler at its close time": proof("holler.closed", live, () =>
    closeDueHollers(db, new Date(Date.now() + 1000 * HOUR)),
  ),
  "a repeating pulse schedules its next round": proof("holler.scheduled", weekly, async (id) =>
    (await nextRound(world.ctx, id, null))?.schedule(),
  ),
  "a recipient snoozes their reminder": proof(
    "reminder.snoozed",
    live,
    (id) => snoozeReminder(recipient("UA"), id, "UA"),
    true,
  ),
  "a recipient adds a note in Slack": {
    action: "response.noted",
    arrange: async () => {
      const hollerId = await live();
      const [question] = await db.query.questions.findMany({
        where: eq(schema.questions.hollerId, hollerId),
      });
      const questionId = question?.id ?? "";
      const [option] = await db.query.options.findMany({
        where: eq(schema.options.questionId, questionId),
      });
      const { responseId } = await recordResponse(recipient("UA"), {
        hollerId,
        slackUserId: "UA",
        via: "slack_button",
        response: { answers: [{ questionId, optionIds: [option?.id ?? ""] }] },
      });
      const note = { responseId, questionId, note: "Because." };
      return () => addNoteFromSlack(world.env, recipient("UA"), note, null);
    },
  },
  "a Slack person signs in for the first time": {
    action: "member.joined",
    arrange: async () => {
      const { userId: theirs } = await slackUser(db, { slackUserId: "UB", teamId: "T" });
      const person = { workspaceId: world.ctx.workspaceId, userId: theirs, slackUserId: "UB" };
      return () => ensureMember(db, person, new Date());
    },
  },
  "a workspace adds Holler again": proof(
    "workspace.reinstalled",
    async () => {
      const teamId = await installed();
      await markUninstalled(db, teamId, new Date(0));
      return teamId;
    },
    install,
    true,
  ),
  "a workspace removes Holler": proof("workspace.uninstalled", installed, (teamId) =>
    markUninstalled(db, teamId, new Date()),
  ),
  "Polar changes the plan": {
    action: "plan.changed",
    arrange: async () => {
      const modified_at = new Date().toISOString();
      const data = {
        id: "sub_1",
        created_at: modified_at,
        modified_at,
        status: "active",
        cancel_at_period_end: true,
        current_period_end: inAnHour().toISOString(),
        ends_at: inAnHour().toISOString(),
        customer_id: "cus_1",
        metadata: {},
        customer: { external_id: world.ctx.workspaceId },
      } satisfies Partial<Record<keyof models.Subscription, unknown>>;
      const event = { type: "subscription.updated", timestamp: modified_at, data };
      return () =>
        applyPolarEvent({ db, now: () => new Date() }, event as unknown as webhooks.WebhookPayload);
    },
  },
};

const kept = [
  ...["activity", "hollers", "questions", "recipients", "answer_notes", "viewers"],
  ...["workspaces", "slack_installations", "members", "oauth_consent", "polar_events"],
].map((table) => `select * from ${table}`);

async function stored() {
  const statements = [...kept, "select * from apikey where metadata like '%memberId%'"];
  const results = await raw.batch<Record<string, unknown>>(
    statements.map((statement) => raw.prepare(statement)),
  );
  return results.map((result) => result.results);
}

async function refuse(action: string) {
  const when = `new.action = '${action}'`;
  const raise = "select raise(abort, 'no Activity today')";
  await raw
    .prepare(
      `create trigger refuse_activity before insert on activity when ${when} begin ${raise}; end`,
    )
    .run();
}

const allow = () => raw.prepare("drop trigger refuse_activity").run();

const actions = async () =>
  (await db.query.activity.findMany({ orderBy: (a, { asc }) => asc(a.id) })).map((a) => a.action);

function proves(proofs: Record<string, Proof>) {
  for (const [name, { action, arrange, eachCallChanges }] of Object.entries(proofs)) {
    it(`${name}: changes nothing when Activity cannot record it, and is recorded once`, async () => {
      const act = await arrange();
      const before = await stored();
      const queuedBefore = world.queued.length;

      await refuse(action);
      await Promise.allSettled([act()]);
      expect(await stored()).toEqual(before);
      expect(world.queued).toHaveLength(queuedBefore);

      await allow();
      const recordedBefore = await actions();
      await act();
      const changed = (await stored()).filter((rows, at) => !sameRows(rows, before[at]));
      expect(changed.length).toBeGreaterThan(1);
      const recorded = await actions();
      expect(recorded).toHaveLength(recordedBefore.length + 1);
      expect(recorded.filter((a) => a === action)).toHaveLength(
        recordedBefore.filter((a) => a === action).length + 1,
      );
    });

    if (eachCallChanges) continue;
    it(`${name}: two at once are recorded once`, async () => {
      const act = await arrange();
      const before = (await actions()).filter((a) => a === action).length;
      await Promise.allSettled([act(), act()]);
      expect((await actions()).filter((a) => a === action)).toHaveLength(before + 1);
    });
  }
}

const sameRows = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

describe("a change and its Activity land together", () => {
  describe("routes", () => {
    it("every mutating route has a proof or a reason it records nothing", () => {
      const mutating = new Set(
        inspectRoutes(app)
          .filter((r) => !["GET", "HEAD"].includes(r.method))
          .filter((r) => r.method !== "ALL" || !r.isMiddleware)
          .map((r) => `${r.method} ${r.path}`),
      );
      const known = [...Object.keys(routeProofs), ...Object.keys(unrecordedRoutes)];
      expect([...mutating].sort()).toEqual(known.sort());
    });
    proves(routeProofs);
  });

  describe("MCP tools", () => {
    it("every tool that is not read-only has a proof or a reason it records nothing", async () => {
      const { client } = await mcpClient();
      const { tools } = await client.listTools();
      const mutating = tools.filter((t) => !t.annotations?.readOnlyHint).map((t) => t.name);
      const known = [...Object.keys(toolProofs), ...Object.keys(unrecordedTools)];
      expect(mutating.sort()).toEqual(known.sort());
    });
    proves(toolProofs);
  });

  describe("Slack, the cron and webhooks", () => {
    proves(serviceProofs);
  });
});

describe("a change that is undone leaves no Activity", () => {
  it("a send whose next round cannot be scheduled goes back as it was", async () => {
    const id = await weekly();
    const due = new Date(Date.now() + 2 * HOUR);
    await sendHoller(world.ctx, world.env, id);
    const before = await stored();
    await refuse("holler.scheduled");
    expect(await sendDueHollers(world.env, db, due)).toEqual([]);
    const [activity, hollers, ...rest] = await stored();
    const [activityBefore, hollersBefore, ...restBefore] = before;
    expect(activity).toEqual(activityBefore);
    expect(rest).toEqual(restBefore);
    expect(hollers).toMatchObject((hollersBefore ?? []).map(({ updated_at: _, ...row }) => row));
  });

  it("a reminder the queue refuses is not recorded", async () => {
    const id = await live();
    const before = await stored();
    const refusing = { sendBatch: () => Promise.reject(new Error("Queue is down")) };
    const env = { ...world.env, SLACK_SENDS: refusing } as unknown as Bindings;
    await expect(remindWaiting(world.ctx, env, id)).rejects.toThrow("Queue is down");
    expect(await stored()).toEqual(before);
  });

  it("a Holler the cron cannot send tells its creator once, however many runs overlap", async () => {
    const act =
      await serviceProofs["the cron puts a Holler it cannot send back to draft"]?.arrange();
    await Promise.allSettled([act?.(), act?.()]);
    expect(world.queued.filter((send) => send.kind === "send_failed")).toHaveLength(1);
  });
});
