import { eq } from "@holler/core/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Db, schema } from "../db";
import type { SlackUser } from "../slack/client";
import { SlackApiError } from "../slack/client";
import { FakeSlack } from "../slack/fake";
import { testDb } from "../test-db";
import { searchDirectory } from "./directory";
import {
  foldForSearch,
  refreshSlackPerson,
  syncDirectoryStep,
  workspacesDueForSync,
} from "./directory-sync";
import { grantFor, TEST_TOKEN_KEY } from "./slack-fixtures";
import { completeInstall } from "./workspaces";

let db: Db;
let dispose: () => Promise<void>;
beforeAll(async () => ({ db, dispose } = await testDb()));
afterAll(() => dispose());

const now = new Date("2026-11-21T09:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

const person = (id: string, realName: string, extra: Partial<SlackUser> = {}): SlackUser => ({
  id,
  name: realName.toLowerCase().replace(/\s/g, "."),
  tz: "Europe/Tallinn",
  profile: { real_name: realName, display_name: "", image_72: `https://example.test/${id}.png` },
  ...extra,
});

async function installed() {
  const outcome = await completeInstall(db, {
    grant: grantFor(),
    slack: new FakeSlack(),
    tokenKey: TEST_TOKEN_KEY,
    now,
  });
  if (outcome.status !== "installed") throw new Error("expected an install");
  return outcome.workspaceId;
}

const peopleOf = (workspaceId: string) =>
  db.query.slackPeople.findMany({ where: eq(schema.slackPeople.workspaceId, workspaceId) });
const groupsOf = (workspaceId: string) =>
  db.query.slackGroups.findMany({ where: eq(schema.slackGroups.workspaceId, workspaceId) });

describe("foldForSearch", () => {
  it("folds every script, not only ASCII", () => {
    expect(foldForSearch("Ölmez Çelik", null, "ÅSA")).toBe("ölmez çelik åsa");
  });
});

describe("syncDirectoryStep", () => {
  it("fills people, user groups and channels, a few pages per step", async () => {
    const workspaceId = await installed();
    const slack = new FakeSlack(
      [
        person("U1", "Ölmez Kaya"),
        person("U2", "Ben Ito"),
        person("U3", "Gone Person", { deleted: true }),
        person("U4", "Deploy Bot", { is_bot: true }),
        person("U5", "Cara Ng"),
      ],
      [{ id: "S1", name: "Design team", handle: "design", user_count: 4, members: [] }],
      [
        { id: "C1", name: "general", num_members: 5 },
        { id: "C2", name: "leads", is_private: true, num_members: 2 },
        { id: "C3", name: "old", is_archived: true },
      ],
    );
    slack.pageSize = 2;

    // Three pages of people at two per step: the first step stops partway.
    expect(await syncDirectoryStep(db, slack, workspaceId, now, 2)).toBe("more");
    expect(await peopleOf(workspaceId)).toHaveLength(4);
    expect(await syncDirectoryStep(db, slack, workspaceId, now, 2)).toBe("more");
    expect(await syncDirectoryStep(db, slack, workspaceId, now, 2)).toBe("done");

    const people = await peopleOf(workspaceId);
    expect(people).toHaveLength(5);
    expect(people.find((p) => p.slackUserId === "U1")).toMatchObject({
      name: "Ölmez Kaya",
      searchName: "ölmez kaya",
      timeZone: "Europe/Tallinn",
      avatarUrl: "https://example.test/U1.png",
    });
    expect(people.find((p) => p.slackUserId === "U3")?.isDeleted).toBe(true);
    expect(people.find((p) => p.slackUserId === "U4")?.isBot).toBe(true);
    expect((await groupsOf(workspaceId)).map((g) => [g.slackId, g.kind]).sort()).toEqual([
      ["C1", "channel"],
      ["C2", "channel"],
      ["S1", "usergroup"],
    ]);

    const ctx = { db, workspaceId, actor: { via: "system" as const }, now: () => now };
    const found = await searchDirectory(ctx, "ÖLMEZ");
    expect(found.people.map((p) => p.slackUserId)).toEqual(["U1"]);
    expect((await searchDirectory(ctx, "")).people.map((p) => p.slackUserId)).not.toContain("U3");
  });

  it("removes groups and channels Slack stopped listing on the next full sync", async () => {
    const workspaceId = await installed();
    const slack = new FakeSlack(
      [person("U1", "Ada Lund")],
      [{ id: "S1", name: "Ops", handle: "ops", members: [] }],
      [{ id: "C1", name: "general" }],
    );
    await syncDirectoryStep(db, slack, workspaceId, now, 10);
    slack.groups.splice(0);
    slack.channels.splice(0);
    const later = new Date(now.getTime() + DAY + 1);
    expect(await syncDirectoryStep(db, slack, workspaceId, later, 10)).toBe("done");
    expect(await groupsOf(workspaceId)).toEqual([]);
  });

  it("keeps its place when Slack rate-limits it", async () => {
    const workspaceId = await installed();
    const slack = new FakeSlack([person("U1", "Ada Lund"), person("U2", "Bo Ek")]);
    slack.pageSize = 1;
    let calls = 0;
    const listUsers = slack.listUsers.bind(slack);
    slack.listUsers = async (cursor?: string) => {
      calls += 1;
      if (calls === 2) throw new SlackApiError("users.list", "ratelimited", 30);
      return listUsers(cursor);
    };
    expect(await syncDirectoryStep(db, slack, workspaceId, now, 5)).toBe("more");
    expect(await peopleOf(workspaceId)).toHaveLength(1);
    expect(await syncDirectoryStep(db, slack, workspaceId, now, 5)).toBe("done");
    expect(await peopleOf(workspaceId)).toHaveLength(2);
  });
});

describe("refreshSlackPerson", () => {
  it("updates one person from a user_change event", async () => {
    const workspaceId = await installed();
    await refreshSlackPerson(db, workspaceId, person("U1", "Ada Lund"), now);
    await refreshSlackPerson(
      db,
      workspaceId,
      person("U1", "Ada Lund", {
        profile: { real_name: "Ada Lund-Berg", display_name: "ada" },
      }),
      now,
    );
    expect(await peopleOf(workspaceId)).toMatchObject([
      { name: "Ada Lund-Berg", displayName: "ada", searchName: "ada lund-berg ada" },
    ]);
  });
});

describe("workspacesDueForSync", () => {
  it("picks installed workspaces never synced, mid-sync or a day stale, and skips the rest", async () => {
    const fresh = await installed();
    const synced = await installed();
    await syncDirectoryStep(db, new FakeSlack(), synced, now, 10);
    const due = await workspacesDueForSync(db, now, 100);
    expect(due).toContain(fresh);
    expect(due).not.toContain(synced);
    expect(await workspacesDueForSync(db, new Date(now.getTime() + DAY + 1), 100)).toContain(
      synced,
    );
  });
});
