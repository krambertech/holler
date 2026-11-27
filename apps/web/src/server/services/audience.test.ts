import { and, eq } from "@holler/core/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { type Db, schema } from "../db";
import { SlackApiError } from "../slack/client";
import { FakeSlack } from "../slack/fake";
import { testDb } from "../test-db";
import { countReach, MEMBERS_FRESH_FOR_MS } from "./audience";
import type { ServiceContext } from "./context";
import { workspaceFixture } from "./fixtures";

let db: Db;
let dispose: () => Promise<void>;
beforeAll(async () => ({ db, dispose } = await testDb()));
afterAll(() => dispose());

const zones: Record<string, string> = {
  UA: "Europe/Berlin",
  UB: "Europe/Berlin",
  UC: "Asia/Tokyo",
  UD: "America/New_York",
};

async function workspace() {
  const fixture = await workspaceFixture(db);
  for (const [slackUserId, timeZone] of Object.entries(zones)) {
    await db
      .update(schema.slackPeople)
      .set({ timeZone })
      .where(
        and(
          eq(schema.slackPeople.workspaceId, fixture.workspaceId),
          eq(schema.slackPeople.slackUserId, slackUserId),
        ),
      );
  }
  const slack = new FakeSlack(
    ["ULEAD", "UA", "UB", "UC", "UD", "UE", "UF", "ULEFT"].map((id) => ({ id, name: id })),
    [
      { id: "S1", name: "Design", handle: "design", members: ["UA", "UB", "UC"] },
      { id: "S2", name: "Leads", handle: "leads", members: ["UB", "UC", "UD"] },
      { id: "S3", name: "Gone", handle: "gone", members: ["ULEFT", "UE"] },
    ],
    [{ id: "C1", name: "general" }],
  );
  return { ...fixture, slack };
}

const audience = (input: { people?: string[]; groups?: string[]; everyone?: boolean }) => ({
  people: input.people ?? [],
  groups: input.groups ?? [],
  everyone: input.everyone ?? false,
});

const later = (ctx: ServiceContext, ms: number): ServiceContext => ({
  ...ctx,
  now: () => new Date(ctx.now().getTime() + ms),
});

describe("countReach", () => {
  it("counts a person once when they are in two groups and also picked by name", async () => {
    const { ctx, slack } = await workspace();
    const reach = await countReach(
      ctx,
      slack,
      audience({ people: ["UA", "UD", "UF"], groups: ["S1", "S2"] }),
    );
    expect(reach.people).toBe(5);
    expect(reach.zones).toEqual(
      expect.arrayContaining([
        { zone: "Europe/Berlin", people: 2 },
        { zone: "Asia/Tokyo", people: 1 },
        { zone: "America/New_York", people: 1 },
        { zone: null, people: 1 },
      ]),
    );
    expect(reach.zones).toHaveLength(4);
  });

  it("leaves out people who are not in the directory or have left", async () => {
    const { ctx, workspaceId, slack } = await workspace();
    await db
      .update(schema.slackPeople)
      .set({ isDeleted: true })
      .where(
        and(
          eq(schema.slackPeople.workspaceId, workspaceId),
          eq(schema.slackPeople.slackUserId, "UE"),
        ),
      );
    const reach = await countReach(ctx, slack, audience({ groups: ["S3"] }));
    expect(reach).toEqual({ people: 0, zones: [] });
  });

  it("follows every page of a channel's members", async () => {
    const { ctx, slack } = await workspace();
    slack.pageSize = 2;
    const reach = await countReach(ctx, slack, audience({ groups: ["C1"] }));
    expect(reach.people).toBe(7);
  });

  it("counts everyone from the directory without asking Slack", async () => {
    const { ctx, slack } = await workspace();
    const asked = vi.spyOn(slack, "userGroupMembers");
    const reach = await countReach(ctx, slack, audience({ everyone: true }));
    expect(reach.people).toBe(7);
    expect(asked).not.toHaveBeenCalled();
  });

  it("asks Slack for a group's members again only once they are a few minutes old", async () => {
    const { ctx, slack } = await workspace();
    const asked = vi.spyOn(slack, "userGroupMembers");
    await countReach(ctx, slack, audience({ groups: ["S1"] }));
    await countReach(ctx, slack, audience({ people: ["UD"], groups: ["S1"] }));
    expect(asked).toHaveBeenCalledTimes(1);
    await countReach(later(ctx, MEMBERS_FRESH_FOR_MS + 1), slack, audience({ groups: ["S1"] }));
    expect(asked).toHaveBeenCalledTimes(2);
  });

  it("says Slack is unavailable when it refuses, and asks again next time", async () => {
    const { ctx, slack } = await workspace();
    slack.failures.set("S2", new SlackApiError("usergroups.users.list", "ratelimited", 30));
    await expect(countReach(ctx, slack, audience({ groups: ["S2"] }))).rejects.toMatchObject({
      code: "slack_unavailable",
    });
    slack.failures.delete("S2");
    const reach = await countReach(ctx, slack, audience({ groups: ["S2"] }));
    expect(reach.people).toBe(3);
  });
});
