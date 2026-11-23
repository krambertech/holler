import { newId } from "@holler/core";
import { and, eq } from "@holler/core/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type Db, schema } from "../db";
import { testDb } from "../test-db";
import { type Activity, activityOf, recordChange, takeBack } from "./audit";
import type { ServiceContext } from "./context";
import { workspaceFixture } from "./fixtures";

const { hollers, members } = schema;

let db: Db;
let dispose: () => Promise<void>;
let ctx: ServiceContext;
let memberId: string;
beforeAll(async () => ({ db, dispose } = await testDb()));
afterAll(() => dispose());
beforeEach(async () => ({ ctx, memberId } = await workspaceFixture(db)));

const rows = () =>
  db.query.activity.findMany({ where: eq(schema.activity.workspaceId, ctx.workspaceId) });

const noted = (data?: Record<string, unknown>) =>
  activityOf(ctx, {
    action: "holler.closed",
    subjectType: "holler",
    subjectId: "h",
    ...(data ? { data } : {}),
  });

async function holler() {
  const id = newId("holler");
  await db.insert(hollers).values({
    id,
    workspaceId: ctx.workspaceId,
    creatorId: memberId,
    mode: "pulse",
    title: "How was your week?",
    createdVia: "web",
  });
  return id;
}

const close = (id: string) =>
  db
    .update(hollers)
    .set({ status: "closed" })
    .where(and(eq(hollers.id, id), eq(hollers.status, "draft")))
    .returning({ id: hollers.id });

describe("recordChange", () => {
  it("stores who did what, when and through which door", async () => {
    const id = await holler();
    await recordChange(ctx, noted({ reason: "creator" }), close(id));
    expect(await rows()).toEqual([
      {
        id: expect.stringMatching(/./),
        workspaceId: ctx.workspaceId,
        via: "web",
        memberId,
        credentialId: null,
        action: "holler.closed",
        subjectType: "holler",
        subjectId: "h",
        data: { reason: "creator" },
        at: ctx.now(),
      },
    ]);
  });

  it("returns the changed rows and records one Activity for two callers at once", async () => {
    const id = await holler();
    const results = await Promise.all([1, 2].map(() => recordChange(ctx, noted(), close(id))));
    expect(results.map((r) => r.length).sort()).toEqual([0, 1]);
    expect(await rows()).toHaveLength(1);
  });

  it("records a deletion once for two callers at once", async () => {
    const id = await holler();
    const remove = () => db.delete(hollers).where(eq(hollers.id, id));
    await Promise.all([1, 2].map(() => recordChange(ctx, noted(), remove())));
    expect(await rows()).toHaveLength(1);
  });

  it("records nothing for an insert another caller made first", async () => {
    const { userId } = (await db.query.members.findFirst({ where: eq(members.id, memberId) })) ?? {
      userId: "",
    };
    const joinAs = () =>
      db
        .insert(members)
        .values({ id: newId("member"), workspaceId: ctx.workspaceId, userId, slackUserId: "UA" })
        .onConflictDoNothing()
        .returning({ id: members.id });
    const results = await Promise.all([1, 2].map(() => recordChange(ctx, noted(), joinAs())));
    expect(results.map((r) => r.length).sort()).toEqual([0, 1]);
    expect(await rows()).toHaveLength(1);
  });

  it("looks only at the change, whatever runs before and after it", async () => {
    const [closed, open] = [await holler(), await holler()];
    await recordChange(ctx, noted(), close(closed));
    const rename = () => db.update(hollers).set({ title: "Renamed" }).where(eq(hollers.id, open));
    await recordChange(ctx, noted(), close(closed), { before: [rename()], after: [rename()] });
    expect(await rows()).toHaveLength(1);
  });

  it("keeps none of it when one statement fails", async () => {
    const id = await holler();
    const orphan = db.insert(hollers).values({
      id: newId("holler"),
      workspaceId: ctx.workspaceId,
      creatorId: "nobody",
      mode: "pulse",
      title: "",
      createdVia: "web",
    });
    await expect(recordChange(ctx, noted(), close(id), { after: [orphan] })).rejects.toThrow();
    expect(await rows()).toEqual([]);
    expect((await db.query.hollers.findFirst({ where: eq(hollers.id, id) }))?.status).toBe("draft");
  });
});

describe("takeBack", () => {
  it("removes that Activity in the batch that undoes the change", async () => {
    const id = await holler();
    const activity = noted();
    await recordChange(ctx, activity, close(id));
    await recordChange(ctx, noted(), db.delete(hollers).where(eq(hollers.id, await holler())));
    await takeBack(ctx, activity, [
      db.update(hollers).set({ status: "draft" }).where(eq(hollers.id, id)),
    ]);
    expect(await rows()).toHaveLength(1);
    expect((await db.query.hollers.findFirst({ where: eq(hollers.id, id) }))?.status).toBe("draft");
  });
});

describe("Activity", () => {
  it("is a type error to await, to run as a statement, to write alone and to make by hand", () => {
    const misuses = async (activity: Activity) => {
      // @ts-expect-error
      // oxlint-disable-next-line typescript/await-thenable -- this line is the misuse the types refuse
      await activity;
      // @ts-expect-error
      await db.batch([activity]);
      // @ts-expect-error
      await recordChange(ctx, activity);
      // @ts-expect-error
      await recordChange(ctx, activity, activity);
      // @ts-expect-error
      await recordChange(ctx, { action: "holler.closed" }, close("h"));
    };
    expect(misuses).toBeTypeOf("function");
  });
});
