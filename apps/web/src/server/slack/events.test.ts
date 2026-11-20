import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../app";
import type { Db } from "../db";
import { grantFor, TEST_TOKEN_KEY } from "../services/slack-fixtures";
import { completeInstall } from "../services/workspaces";
import { testDb } from "../test-db";
import { FakeSlack } from "./fake";
import { sign } from "./verify";

let db: Db;
let raw: D1Database;
let dispose: () => Promise<void>;
beforeAll(async () => ({ db, raw, dispose } = await testDb()));
afterAll(() => dispose());

const secret = "test-signing-secret";
const env = () => ({
  DB: raw,
  SLACK_SIGNING_SECRET: secret,
  SLACK_TOKEN_KEY: TEST_TOKEN_KEY,
  BETTER_AUTH_SECRET: "a-test-secret-that-is-long-enough-for-auth",
  PRODUCT_URL: "http://localhost:5280",
  DEV_ROUTES: "false",
});

async function post(body: unknown, signature?: string) {
  const text = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  return app.request(
    "/slack/events",
    {
      method: "POST",
      body: text,
      headers: {
        "content-type": "application/json",
        "x-slack-request-timestamp": timestamp,
        "x-slack-signature": signature ?? (await sign(secret, `v0:${timestamp}:${text}`)),
      },
    },
    env(),
  );
}

async function installedTeam() {
  const grant = grantFor();
  const outcome = await completeInstall(db, {
    grant,
    slack: new FakeSlack(),
    tokenKey: TEST_TOKEN_KEY,
    now: new Date(),
  });
  if (outcome.status !== "installed") throw new Error("expected an install");
  return { teamId: grant.teamId, workspaceId: outcome.workspaceId };
}

const workspace = (id: string) =>
  db.query.workspaces.findFirst({ where: (row, { eq }) => eq(row.id, id) });

describe("/slack/events", () => {
  it("refuses a request without a valid signature", async () => {
    const response = await post({ type: "url_verification", challenge: "x" }, "v0=forged");
    expect(response.status).toBe(401);
  });

  it("answers Slack's URL check", async () => {
    const response = await post({ type: "url_verification", challenge: "abc" });
    expect(await response.json()).toEqual({ challenge: "abc" });
  });

  it("marks the workspace uninstalled on app_uninstalled", async () => {
    const { teamId, workspaceId } = await installedTeam();
    const response = await post({
      type: "event_callback",
      team_id: teamId,
      event_id: `Ev${workspaceId}`,
      event: { type: "app_uninstalled" },
    });
    expect(response.status).toBe(200);
    expect((await workspace(workspaceId))?.uninstalledAt).toBeInstanceOf(Date);
  });

  it("marks it uninstalled when the bot token is revoked, not a person's", async () => {
    const { teamId, workspaceId } = await installedTeam();
    await post({
      type: "event_callback",
      team_id: teamId,
      event_id: `EvUser${workspaceId}`,
      event: { type: "tokens_revoked", tokens: { oauth: ["U1"] } },
    });
    expect((await workspace(workspaceId))?.uninstalledAt).toBeNull();
    await post({
      type: "event_callback",
      team_id: teamId,
      event_id: `EvBot${workspaceId}`,
      event: { type: "tokens_revoked", tokens: { bot: ["B0HOLLER"] } },
    });
    expect((await workspace(workspaceId))?.uninstalledAt).toBeInstanceOf(Date);
  });

  it("handles a retried event once", async () => {
    const { teamId, workspaceId } = await installedTeam();
    const event = (name: string) => ({
      type: "event_callback",
      team_id: teamId,
      event_id: `EvJoin${workspaceId}`,
      event: { type: "team_join", user: { id: "U9", name: "n", profile: { real_name: name } } },
    });
    await post(event("First Name"));
    await post(event("Second Name"));
    const people = await db.query.slackPeople.findMany({
      where: (row, { eq }) => eq(row.workspaceId, workspaceId),
    });
    expect(people.map((p) => p.name)).toEqual(["First Name"]);
  });
});
