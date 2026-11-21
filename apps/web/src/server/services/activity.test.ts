import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../db";
import { FakeSlack } from "../slack/fake";
import { testDb } from "../test-db";
import { ACTIVITY_PAGE, listActivity } from "./activity";
import { audit } from "./audit";
import type { ServiceContext } from "./context";
import { linkSlackAccount, setMemberRole } from "./members";
import { grantFor, slackUser, TEST_TOKEN_KEY } from "./slack-fixtures";
import { completeInstall } from "./workspaces";

let db: Db;
let dispose: () => Promise<void>;
beforeAll(async () => ({ db, dispose } = await testDb()));
afterAll(() => dispose());

const now = new Date("2026-11-21T09:00:00Z");

async function team(installer: string) {
  const grant = grantFor({ installerSlackUserId: installer });
  const outcome = await completeInstall(db, {
    grant,
    slack: new FakeSlack(),
    tokenKey: TEST_TOKEN_KEY,
    now,
  });
  if (outcome.status !== "installed") throw new Error("expected an install");
  const ids: Record<string, string> = {};
  for (const slackUserId of [installer, `${installer}S`]) {
    const person = await slackUser(db, { slackUserId, teamId: grant.teamId });
    const memberId = await linkSlackAccount(db, { ...person, providerId: "slack" }, now);
    if (!memberId) throw new Error("expected a member");
    ids[slackUserId] = memberId;
  }
  const as = (slackUserId: string, at = now): ServiceContext => ({
    db,
    workspaceId: outcome.workspaceId,
    actor: { via: "web", memberId: ids[slackUserId] ?? "", slackUserId },
    now: () => at,
  });
  return { workspaceId: outcome.workspaceId, ids, as };
}

describe("listActivity", () => {
  it("shows owners every write in their workspace, newest first, with who made it", async () => {
    const { ids, as } = await team("UACT1");
    await setMemberRole(as("UACT1", new Date(now.getTime() + 1000)), ids.UACT1S ?? "", "owner");
    const out = await listActivity(as("UACT1"), {});
    expect(out.entries[0]).toMatchObject({
      action: "member.role_changed",
      via: "web",
      actor: { slackUserId: "UACT1" },
      subject: { type: "member", id: ids.UACT1S },
      detail: { from: "sender", to: "owner" },
    });
    expect(out.entries.map((e) => e.action)).toEqual(
      expect.arrayContaining(["workspace.installed", "member.joined"]),
    );
    const times = out.entries.map((e) => e.at);
    expect(times).toEqual([...times].sort().reverse());
  });

  it("refuses a sender", async () => {
    const { as } = await team("UACT2");
    await expect(listActivity(as("UACT2S"), {})).rejects.toMatchObject({ code: "forbidden" });
  });

  it("never shows another workspace's activity", async () => {
    const one = await team("UACT3");
    const two = await team("UACT4");
    const ids = new Set((await listActivity(one.as("UACT3"), {})).entries.map((e) => e.id));
    for (const entry of (await listActivity(two.as("UACT4"), {})).entries) {
      expect(ids.has(entry.id)).toBe(false);
    }
  });

  it("pages through every row once, even when rows share a moment", async () => {
    const { workspaceId, as } = await team("UACT5");
    for (let i = 0; i < ACTIVITY_PAGE + 7; i++) {
      await audit(as("UACT5", new Date(now.getTime() + 60_000 + Math.floor(i / 3))), {
        action: "plan.changed",
        subjectType: "workspace",
        subjectId: workspaceId,
        data: { from: "free", to: "team", polarSubscriptionId: "sub_secret" },
      });
    }
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await listActivity(as("UACT5"), { cursor });
      expect(page.entries.length).toBeLessThanOrEqual(ACTIVITY_PAGE);
      seen.push(...page.entries.map((e) => e.id));
      for (const entry of page.entries) expect(JSON.stringify(entry)).not.toContain("sub_secret");
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(new Set(seen).size).toBe(seen.length);
    const all = await db.query.activity.findMany({
      where: (a, { eq }) => eq(a.workspaceId, workspaceId),
    });
    expect(seen.length).toBe(all.length);
  });
});
