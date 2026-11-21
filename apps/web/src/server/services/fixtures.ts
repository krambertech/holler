import { newId } from "@holler/core";
import { eq } from "@holler/core/db";
import { runBatch } from "../batch";
import { type Db, schema } from "../db";
import type { ServiceContext } from "./context";

/** A workspace with one member and a few Slack people, for service tests. */
export async function workspaceFixture(db: Db, now = new Date("2026-11-20T10:00:00Z")) {
  const workspaceId = newId("workspace");
  const memberId = newId("member");
  const userId = crypto.randomUUID();
  await db.batch([
    db
      .insert(schema.workspaces)
      .values({ id: workspaceId, slackTeamId: `T${workspaceId}`, name: "Test" }),
    db.insert(schema.user).values({
      id: userId,
      name: "Lead",
      email: `${userId}@test.local`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    }),
    db
      .insert(schema.members)
      .values({ id: memberId, workspaceId, userId, slackUserId: "ULEAD", role: "owner" }),
    ...["ULEAD", "UA", "UB", "UC", "UD", "UE", "UF"].map((slackUserId) =>
      db.insert(schema.slackPeople).values({
        workspaceId,
        slackUserId,
        name: `Person ${slackUserId}`,
        searchName: `person ${slackUserId}`.toLocaleLowerCase(),
      }),
    ),
  ]);
  const ctx: ServiceContext = {
    db,
    workspaceId,
    actor: { via: "web", memberId, slackUserId: "ULEAD" },
    now: () => now,
  };
  return { ctx, workspaceId, memberId, now };
}

/** Marks a draft live and adds recipients, standing in for the send that the Slack work adds. */
export async function makeLive(db: Db, hollerId: string, slackUserIds: string[], now: Date) {
  await db
    .update(schema.hollers)
    .set({ status: "live", sentAt: now, closesAt: new Date(now.getTime() + 72 * 3600_000) })
    .where(eq(schema.hollers.id, hollerId));
  await runBatch(
    db,
    slackUserIds.map((slackUserId) =>
      db
        .insert(schema.recipients)
        .values({ hollerId, slackUserId, addedVia: "person", invitedAt: now }),
    ),
  );
}
