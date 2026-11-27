import { newId } from "@holler/core";
import { and, eq } from "@holler/core/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runBatch } from "../batch";
import { type Db, schema } from "../db";
import type { Bindings } from "../env";
import { testDb } from "../test-db";
import type { ServiceContext } from "./context";
import { makeLive, workspaceFixture } from "./fixtures";
import { createDraft } from "./hollers";
import { recordResponse } from "./responses";
import { devSlack } from "./slack-connection";
import {
  deleteUninstalledWorkspaces,
  deleteWorkspace,
  deletionStatements,
  dueForDeletion,
} from "./workspace-deletion";

let db: Db;
let raw: D1Database;
let dispose: () => Promise<void>;
beforeAll(async () => ({ db, raw, dispose } = await testDb()));
afterAll(() => dispose());

const env = { DEV_ROUTES: "true" } as Bindings;
const now = new Date("2026-11-21T09:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

const sharedTables = new Set([
  "d1_migrations",
  "jwks",
  "oauth_client",
  "oauth_client_assertion",
  "oauth_client_resource",
  "oauth_resource",
  "slack_deliveries",
  "verification",
]);

async function tables(): Promise<string[]> {
  const { results } = await raw
    .prepare(
      "select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name not like '_cf_%' order by name",
    )
    .all<{ name: string }>();
  return results.map((row) => row.name);
}

async function snapshot(): Promise<Record<string, unknown[]>> {
  const all: Record<string, unknown[]> = {};
  for (const table of await tables()) {
    const { results } = await raw.prepare(`select * from "${table}"`).all();
    all[table] = results.map((row) => JSON.stringify(row)).sort();
  }
  return all;
}

async function sharedClient(): Promise<string> {
  const clientId = `client-${crypto.randomUUID()}`;
  await db.insert(schema.oauthClient).values({
    id: crypto.randomUUID(),
    clientId,
    redirectUris: ["http://127.0.0.1:9999/callback"],
  });
  return clientId;
}

async function fullWorkspace(clientId: string, alsoIn?: { userId: string } | undefined) {
  const fixture = await workspaceFixture(db, now);
  const { workspaceId, memberId, ctx } = fixture;
  const lead = await db.query.members.findFirst({ where: eq(schema.members.id, memberId) });
  if (!lead) throw new Error("fixture member missing");
  const secondMemberId = newId("member");
  const secondUserId = alsoIn?.userId ?? crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const refreshId = crypto.randomUUID();
  if (!alsoIn) {
    await db.insert(schema.user).values({
      id: secondUserId,
      name: "Second",
      email: `${secondUserId}@test.local`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
  }
  await db.batch([
    db.insert(schema.members).values({
      id: secondMemberId,
      workspaceId,
      userId: secondUserId,
      slackUserId: "UA",
      role: "sender",
    }),
    db.insert(schema.session).values({
      id: sessionId,
      userId: lead.userId,
      token: crypto.randomUUID(),
      expiresAt: new Date(now.getTime() + DAY),
      createdAt: now,
      updatedAt: now,
    }),
    db.insert(schema.account).values({
      id: crypto.randomUUID(),
      userId: lead.userId,
      accountId: `U-${workspaceId}`,
      providerId: "slack",
      createdAt: now,
      updatedAt: now,
    }),
    ...[lead.userId, secondUserId].map((userId, index) =>
      db.insert(schema.apikey).values({
        id: crypto.randomUUID(),
        referenceId: userId,
        key: crypto.randomUUID(),
        metadata: JSON.stringify({ memberId: index === 0 ? memberId : secondMemberId }),
        createdAt: now,
        updatedAt: now,
      }),
    ),
    db.insert(schema.oauthConsent).values({
      id: crypto.randomUUID(),
      clientId,
      userId: secondUserId,
      referenceId: secondMemberId,
      scopes: ["read"],
      createdAt: now,
      updatedAt: now,
    }),
    db.insert(schema.oauthRefreshToken).values({
      id: refreshId,
      token: crypto.randomUUID(),
      clientId,
      userId: secondUserId,
      referenceId: secondMemberId,
      expiresAt: new Date(now.getTime() + DAY),
      createdAt: now,
      scopes: ["read"],
    }),
    db.insert(schema.oauthAccessToken).values({
      id: crypto.randomUUID(),
      token: crypto.randomUUID(),
      clientId,
      userId: secondUserId,
      referenceId: secondMemberId,
      refreshId,
      expiresAt: new Date(now.getTime() + DAY),
      createdAt: now,
      scopes: ["read"],
    }),
    db.insert(schema.slackInstallations).values({
      workspaceId,
      appId: "A1",
      botUserId: "UBOT",
      botTokenCiphertext: "sealed",
      scopes: "chat:write",
      installedBySlackUserId: "ULEAD",
    }),
    db.insert(schema.slackGroups).values({
      workspaceId,
      slackId: "S1",
      kind: "usergroup",
      name: "design",
      searchName: "design",
    }),
    db.insert(schema.slackHomes).values({ workspaceId, slackUserId: "UA", openedAt: now }),
    db.insert(schema.directorySyncs).values({ workspaceId, completedAt: now }),
    db.insert(schema.polarEvents).values({
      id: `subscription.updated:${workspaceId}`,
      workspaceId,
      subscriptionId: `sub-${workspaceId}`,
      type: "subscription.updated",
      occurredAt: now,
      outcome: "applied",
    }),
  ]);

  const holler = await createDraft(ctx, {
    mode: "survey",
    title: "Offsite",
    anonymous: true,
    questions: [
      {
        type: "single",
        prompt: "Where?",
        options: [{ label: "Lisbon" }, { label: "Tallinn" }],
        allowOther: true,
        followUp: { prompt: "Why there?", onlyAfter: null },
      },
    ],
  });
  await makeLive(db, holler.id, ["UA", "UB"], now);
  const [where] = holler.questions;
  const other = await db.query.options.findFirst({
    where: and(eq(schema.options.questionId, where?.id ?? ""), eq(schema.options.isOther, true)),
  });
  await recordResponse(ctx, {
    hollerId: holler.id,
    slackUserId: "UA",
    via: "web",
    response: {
      answers: [
        {
          questionId: where?.id ?? "",
          optionIds: [other?.id ?? ""],
          otherText: "Porto",
          note: "Warm",
        },
      ],
    },
  });
  await db
    .insert(schema.viewers)
    .values({ hollerId: holler.id, slackUserId: "UA", addedById: memberId });
  await devSlack(db, workspaceId);
  return { ...fixture, secondMemberId, secondUserId };
}

function asMember(ctx: ServiceContext, memberId: string, slackUserId: string): ServiceContext {
  return { ...ctx, actor: { via: "web", memberId, slackUserId } };
}

async function everyTableFilledBy(fill: () => Promise<unknown>) {
  const before = await snapshot();
  await fill();
  const after = await snapshot();
  return Object.keys(after).filter(
    (table) => !sharedTables.has(table) && after[table]?.length === before[table]?.length,
  );
}

describe("deleteWorkspace", () => {
  it("leaves the database exactly as it was before the workspace existed", async () => {
    const clientId = await sharedClient();
    const kept = await fullWorkspace(clientId);
    const before = await snapshot();

    let doomed: Awaited<ReturnType<typeof fullWorkspace>> | undefined;
    const unfilled = await everyTableFilledBy(async () => {
      doomed = await fullWorkspace(clientId, { userId: kept.secondUserId });
    });
    expect(unfilled, "the fixture fills every table that holds workspace data").toEqual([]);
    if (!doomed) throw new Error("fixture missing");

    await deleteWorkspace(doomed.ctx, env, { confirmName: "Test" });
    expect(await snapshot()).toEqual(before);
  });

  it("deletes the keys members make while the deletion is on its way, and no one else's", async () => {
    const clientId = await sharedClient();
    const kept = await fullWorkspace(clientId);
    await db.insert(schema.apikey).values({
      id: crypto.randomUUID(),
      referenceId: kept.secondUserId,
      key: crypto.randomUUID(),
      metadata: "not json",
      createdAt: now,
      updatedAt: now,
    });
    const before = await snapshot();
    const doomed = await fullWorkspace(clientId, { userId: kept.secondUserId });
    const lead = await db.query.members.findFirst({
      where: eq(schema.members.id, doomed.memberId),
    });
    if (!lead) throw new Error("fixture member missing");
    const statements = await deletionStatements(db, doomed.workspaceId);
    const lateKeys = [
      { userId: lead.userId, metadata: JSON.stringify({ memberId: doomed.memberId }) },
      {
        userId: kept.secondUserId,
        metadata: JSON.stringify(JSON.stringify({ memberId: doomed.secondMemberId })),
      },
      { userId: kept.secondUserId, metadata: JSON.stringify({ memberId: doomed.secondMemberId }) },
    ];
    for (const late of lateKeys) {
      await db.insert(schema.apikey).values({
        id: crypto.randomUUID(),
        referenceId: late.userId,
        key: crypto.randomUUID(),
        metadata: late.metadata,
        createdAt: now,
        updatedAt: now,
      });
    }
    await runBatch(db, statements);
    expect(await snapshot()).toEqual(before);
  });

  it("is only for owners who type the workspace's name, and never while Team renews", async () => {
    const clientId = await sharedClient();
    const workspace = await fullWorkspace(clientId);
    const sender = asMember(workspace.ctx, workspace.secondMemberId, "UA");
    await expect(deleteWorkspace(sender, env, { confirmName: "Test" })).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(
      deleteWorkspace(workspace.ctx, env, { confirmName: "test" }),
    ).rejects.toMatchObject({ code: "invalid", field: "confirmName" });

    await db
      .update(schema.workspaces)
      .set({ plan: "team", planEndsAt: null })
      .where(eq(schema.workspaces.id, workspace.workspaceId));
    await expect(
      deleteWorkspace(workspace.ctx, env, { confirmName: "Test" }),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(
      await db.query.workspaces.findFirst({
        where: eq(schema.workspaces.id, workspace.workspaceId),
      }),
    ).toBeTruthy();

    await db
      .update(schema.workspaces)
      .set({ planEndsAt: new Date(now.getTime() + 10 * DAY) })
      .where(eq(schema.workspaces.id, workspace.workspaceId));
    await deleteWorkspace(workspace.ctx, env, { confirmName: " Test " });
    expect(
      await db.query.workspaces.findFirst({
        where: eq(schema.workspaces.id, workspace.workspaceId),
      }),
    ).toBeUndefined();
  });

  it("removes Holler from Slack once the data is gone", async () => {
    const workspace = await workspaceFixture(db, now);
    const slack = await devSlack(db, workspace.workspaceId);
    await deleteWorkspace(workspace.ctx, env, { confirmName: "Test" });
    expect(slack.revoked).toBe(true);
    expect(
      await db.query.workspaces.findFirst({
        where: eq(schema.workspaces.id, workspace.workspaceId),
      }),
    ).toBeUndefined();
  });
});

describe("deleteUninstalledWorkspaces", () => {
  async function uninstalled(
    daysAgo: number,
    plan: { plan: "free" | "team"; planEndsAt: Date | null },
  ) {
    const workspace = await workspaceFixture(db, now);
    await db
      .update(schema.workspaces)
      .set({ uninstalledAt: new Date(now.getTime() - daysAgo * DAY), ...plan })
      .where(eq(schema.workspaces.id, workspace.workspaceId));
    return workspace.workspaceId;
  }
  const free = { plan: "free" as const, planEndsAt: null };

  it("deletes a workspace 90 days after its uninstall, and none sooner", async () => {
    const due = await uninstalled(90, free);
    const early = await uninstalled(89, free);
    const paying = await uninstalled(120, { plan: "team", planEndsAt: null });
    const lapsed = await uninstalled(120, {
      plan: "team",
      planEndsAt: new Date(now.getTime() - DAY),
    });
    const deleted = await deleteUninstalledWorkspaces(db, now);
    expect(deleted.sort()).toEqual([due, lapsed].sort());
    const left = await db.query.workspaces.findMany({ columns: { id: true } });
    expect(left.map((w) => w.id)).toEqual(expect.arrayContaining([early, paying]));
    expect(await deleteUninstalledWorkspaces(db, now)).toEqual([]);
  });

  it("keeps a workspace, its people and their keys when it is reinstalled mid-deletion", async () => {
    const clientId = await sharedClient();
    const workspace = await fullWorkspace(clientId);
    await db
      .update(schema.workspaces)
      .set({ uninstalledAt: new Date(now.getTime() - 91 * DAY) })
      .where(eq(schema.workspaces.id, workspace.workspaceId));
    const statements = await deletionStatements(db, workspace.workspaceId, dueForDeletion(now));
    await db
      .update(schema.workspaces)
      .set({ uninstalledAt: null })
      .where(eq(schema.workspaces.id, workspace.workspaceId));
    const before = await snapshot();
    await runBatch(db, statements);
    expect(await snapshot()).toEqual(before);
  });
});
