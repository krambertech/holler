import { eq } from "@holler/core/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Db, schema } from "../db";
import { FakeSlack } from "../slack/fake";
import { decryptToken } from "../slack/tokens";
import { testDb } from "../test-db";
import { linkSlackAccount } from "./members";
import { grantFor, membersOf, slackUser, TEST_TOKEN_KEY } from "./slack-fixtures";
import { completeInstall, installStatus, markUninstalled } from "./workspaces";

let db: Db;
let dispose: () => Promise<void>;
beforeAll(async () => ({ db, dispose } = await testDb()));
afterAll(() => dispose());

const now = new Date("2026-11-21T09:00:00Z");
const install = (grant = grantFor(), slack = new FakeSlack()) =>
  completeInstall(db, { grant, slack, tokenKey: TEST_TOKEN_KEY, now });

async function installationOf(workspaceId: string) {
  return db.query.slackInstallations.findFirst({
    where: eq(schema.slackInstallations.workspaceId, workspaceId),
  });
}

describe("completeInstall", () => {
  it("creates the workspace and stores the bot token encrypted", async () => {
    const grant = grantFor();
    const slack = new FakeSlack([], [], [], {
      id: grant.teamId,
      name: "Northwind",
      domain: "northwind",
      icon: { image_132: "https://example.test/icon.png" },
    });
    const outcome = await install(grant, slack);
    if (outcome.status !== "installed") throw new Error("expected an install");
    expect(outcome.reinstalled).toBe(false);

    const workspace = await db.query.workspaces.findFirst({
      where: eq(schema.workspaces.id, outcome.workspaceId),
    });
    expect(workspace).toMatchObject({
      slackTeamId: grant.teamId,
      name: "Northwind",
      slackDomain: "northwind",
      iconUrl: "https://example.test/icon.png",
      uninstalledAt: null,
    });
    const installation = await installationOf(outcome.workspaceId);
    expect(installation?.botTokenCiphertext).not.toContain(grant.botToken);
    expect(await decryptToken(installation?.botTokenCiphertext ?? "", TEST_TOKEN_KEY)).toBe(
      grant.botToken,
    );
    const activity = await db.query.activity.findMany({
      where: eq(schema.activity.workspaceId, outcome.workspaceId),
    });
    expect(activity.map((a) => a.action)).toContain("workspace.installed");
  });

  it("makes the installer an owner on their first sign-in, and later people senders", async () => {
    const grant = grantFor({ installerSlackUserId: "U0ANA" });
    const outcome = await install(grant);
    if (outcome.status !== "installed") throw new Error("expected an install");
    expect(outcome.installerMemberId).toBeNull();

    const someone = await slackUser(db, { slackUserId: "U0BEN", teamId: grant.teamId });
    await linkSlackAccount(db, { ...someone, providerId: "slack" }, now);
    const installer = await slackUser(db, { slackUserId: "U0ANA", teamId: grant.teamId });
    await linkSlackAccount(db, { ...installer, providerId: "slack" }, now);

    const members = await membersOf(db, outcome.workspaceId);
    expect(members.find((m) => m.slackUserId === "U0ANA")?.role).toBe("owner");
    expect(members.find((m) => m.slackUserId === "U0BEN")?.role).toBe("sender");
  });

  it("makes an installer who signed in before an owner straight away", async () => {
    const grant = grantFor({ installerSlackUserId: "U0EARLY" });
    await slackUser(db, { slackUserId: "U0EARLY", teamId: grant.teamId });
    const outcome = await install(grant);
    if (outcome.status !== "installed") throw new Error("expected an install");
    const members = await membersOf(db, outcome.workspaceId);
    expect(members).toMatchObject([{ id: outcome.installerMemberId, role: "owner" }]);
  });

  it("does not make a reinstaller an owner while the workspace has one", async () => {
    const first = grantFor({ installerSlackUserId: "U0OWNER" });
    await slackUser(db, { slackUserId: "U0OWNER", teamId: first.teamId });
    await install(first);
    await slackUser(db, { slackUserId: "U0OTHER", teamId: first.teamId });
    const again = await install({ ...first, installerSlackUserId: "U0OTHER" });
    if (again.status !== "installed") throw new Error("expected an install");
    expect(again.reinstalled).toBe(true);

    const members = await membersOf(db, again.workspaceId);
    expect(members.find((m) => m.slackUserId === "U0OWNER")?.role).toBe("owner");
    expect(members.find((m) => m.slackUserId === "U0OTHER")?.role).toBe("sender");
    expect((await installationOf(again.workspaceId))?.installedBySlackUserId).toBe("U0OTHER");
  });

  it("promotes the reinstaller when no owner is left", async () => {
    const grant = grantFor({ installerSlackUserId: "U0FIRST" });
    const outcome = await install(grant);
    if (outcome.status !== "installed") throw new Error("expected an install");
    const sender = await slackUser(db, { slackUserId: "U0SECOND", teamId: grant.teamId });
    await linkSlackAccount(db, { ...sender, providerId: "slack" }, now);
    expect((await membersOf(db, outcome.workspaceId))[0]?.role).toBe("sender");

    await install({ ...grant, installerSlackUserId: "U0SECOND" });
    expect((await membersOf(db, outcome.workspaceId))[0]?.role).toBe("owner");
  });

  it("refuses Enterprise Grid and revokes the token", async () => {
    const slack = new FakeSlack();
    const grant = grantFor({ enterpriseId: "E0GRID" });
    expect(await install(grant, slack)).toEqual({ status: "enterprise" });
    expect(slack.revoked).toBe(true);
    expect(
      await db.query.workspaces.findFirst({
        where: eq(schema.workspaces.slackTeamId, grant.teamId),
      }),
    ).toBeUndefined();
  });
});

describe("markUninstalled", () => {
  it("pauses the workspace, drops the token, and a reinstall brings it back", async () => {
    const grant = grantFor();
    const outcome = await install(grant);
    if (outcome.status !== "installed") throw new Error("expected an install");

    expect(await markUninstalled(db, grant.teamId, now)).toBe(true);
    expect(await markUninstalled(db, grant.teamId, now)).toBe(false);
    const workspace = await db.query.workspaces.findFirst({
      where: eq(schema.workspaces.id, outcome.workspaceId),
    });
    expect(workspace?.uninstalledAt).toEqual(now);
    expect(await installationOf(outcome.workspaceId)).toBeUndefined();

    await install(grant);
    const back = await db.query.workspaces.findFirst({
      where: eq(schema.workspaces.id, outcome.workspaceId),
    });
    expect(back?.uninstalledAt).toBeNull();
  });

  it("ignores a team Holler never knew", async () => {
    expect(await markUninstalled(db, "T0NOBODY", now)).toBe(false);
  });
});

describe("installStatus", () => {
  it("tells a signed-in person whose workspace has not installed Holler which one it is", async () => {
    const person = await slackUser(db, { slackUserId: "U0NEW", teamId: "T0NOTYET" });
    await linkSlackAccount(db, { ...person, providerId: "slack" }, now);
    expect(await installStatus(db, person.userId)).toEqual({
      signedIn: true,
      member: false,
      teamName: "Team",
      enterprise: false,
    });
    expect(await installStatus(db, null)).toMatchObject({ signedIn: false, member: false });
  });
});
