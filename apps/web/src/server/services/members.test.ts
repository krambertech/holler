import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../db";
import { FakeSlack } from "../slack/fake";
import { testDb } from "../test-db";
import type { ServiceContext } from "./context";
import { linkSlackAccount, listMembers, setMemberRole, slackClaims } from "./members";
import { grantFor, idTokenFor, membersOf, slackUser, TEST_TOKEN_KEY } from "./slack-fixtures";
import { completeInstall } from "./workspaces";

let db: Db;
let dispose: () => Promise<void>;
beforeAll(async () => ({ db, dispose } = await testDb()));
afterAll(() => dispose());

const now = new Date("2026-11-21T09:00:00Z");

async function team() {
  const grant = grantFor({ installerSlackUserId: "U0OWN" });
  const outcome = await completeInstall(db, {
    grant,
    slack: new FakeSlack(),
    tokenKey: TEST_TOKEN_KEY,
    now,
  });
  if (outcome.status !== "installed") throw new Error("expected an install");
  const ids: Record<string, string> = {};
  for (const slackUserId of ["U0OWN", "U0SAM", "U0KIM"]) {
    const person = await slackUser(db, { slackUserId, teamId: grant.teamId });
    const memberId = await linkSlackAccount(db, { ...person, providerId: "slack" }, now);
    if (!memberId) throw new Error("expected a member");
    ids[slackUserId] = memberId;
  }
  const as = (slackUserId: string): ServiceContext => ({
    db,
    workspaceId: outcome.workspaceId,
    actor: { via: "web", memberId: ids[slackUserId] ?? "", slackUserId },
    now: () => now,
  });
  return { workspaceId: outcome.workspaceId, teamId: grant.teamId, ids, as };
}

describe("slackClaims", () => {
  it("reads the user, team and Grid claims from a Slack ID token", () => {
    expect(slackClaims(idTokenFor({ slackUserId: "U1", teamId: "T1", teamName: "Acme" }))).toEqual({
      slackUserId: "U1",
      teamId: "T1",
      teamName: "Acme",
      enterpriseId: null,
    });
    expect(slackClaims("not-a-token")).toBeNull();
    expect(slackClaims(null)).toBeNull();
  });
});

describe("linkSlackAccount", () => {
  it("links a person to their installed workspace once, however often they sign in", async () => {
    const { workspaceId, teamId } = await team();
    const person = await slackUser(db, { slackUserId: "U0LEE", teamId });
    const first = await linkSlackAccount(db, { ...person, providerId: "slack" }, now);
    const again = await linkSlackAccount(db, { ...person, providerId: "slack" }, now);
    expect(first).toBe(again);
    const lee = (await membersOf(db, workspaceId)).filter((m) => m.slackUserId === "U0LEE");
    expect(lee).toMatchObject([{ role: "sender", userId: person.userId }]);
  });

  it("makes no member for a workspace without Holler, for Grid, or for another provider", async () => {
    const elsewhere = await slackUser(db, { slackUserId: "U0X", teamId: "T0ELSEWHERE" });
    expect(await linkSlackAccount(db, { ...elsewhere, providerId: "slack" }, now)).toBeNull();

    const { teamId } = await team();
    const grid = await slackUser(db, { slackUserId: "U0G", teamId, enterpriseId: "E0GRID" });
    expect(await linkSlackAccount(db, { ...grid, providerId: "slack" }, now)).toBeNull();

    const dev = await slackUser(db, { slackUserId: "U0D", teamId });
    expect(await linkSlackAccount(db, { ...dev, providerId: "credential" }, now)).toBeNull();
  });
});

describe("listMembers", () => {
  it("lists owners first and marks the caller", async () => {
    const { as } = await team();
    const members = await listMembers(as("U0SAM"));
    expect(members.map((m) => [m.slackUserId, m.role, m.isYou])).toEqual([
      ["U0OWN", "owner", false],
      ["U0KIM", "sender", false],
      ["U0SAM", "sender", true],
    ]);
  });
});

describe("setMemberRole", () => {
  it("lets an owner make a sender an owner and back", async () => {
    const { as, ids } = await team();
    await expect(setMemberRole(as("U0OWN"), ids.U0SAM ?? "", "owner")).resolves.toEqual({
      id: ids.U0SAM,
      role: "owner",
    });
    await setMemberRole(as("U0SAM"), ids.U0OWN ?? "", "sender");
    const roles = Object.fromEntries(
      (await listMembers(as("U0SAM"))).map((m) => [m.slackUserId, m.role]),
    );
    expect(roles).toEqual({ U0OWN: "sender", U0SAM: "owner", U0KIM: "sender" });
  });

  it("refuses a sender", async () => {
    const { as, ids } = await team();
    await expect(setMemberRole(as("U0SAM"), ids.U0KIM ?? "", "owner")).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("keeps the last owner an owner", async () => {
    const { as, ids } = await team();
    await expect(setMemberRole(as("U0OWN"), ids.U0OWN ?? "", "sender")).rejects.toMatchObject({
      code: "conflict",
      field: "role",
    });
  });

  it("cannot reach a member of another workspace", async () => {
    const first = await team();
    const second = await team();
    await expect(
      setMemberRole(first.as("U0OWN"), second.ids.U0SAM ?? "", "owner"),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("records the change in Activity", async () => {
    const { as, ids, workspaceId } = await team();
    await setMemberRole(as("U0OWN"), ids.U0KIM ?? "", "owner");
    const rows = await db.query.activity.findMany();
    expect(
      rows.some(
        (row) =>
          row.workspaceId === workspaceId &&
          row.action === "member.role_changed" &&
          row.subjectId === ids.U0KIM,
      ),
    ).toBe(true);
  });
});
