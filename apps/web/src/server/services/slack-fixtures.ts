import { eq } from "@holler/core/db";
import { type Db, schema } from "../db";
import type { SlackInstallGrant } from "../slack/client";

export const TEST_TOKEN_KEY = btoa(String.fromCharCode(...new Uint8Array(32)));

let teams = 0;

export function grantFor(overrides: Partial<SlackInstallGrant> = {}): SlackInstallGrant {
  teams += 1;
  return {
    appId: "A0HOLLER",
    botUserId: "B0HOLLER",
    botToken: `xoxb-test-${teams}`,
    scopes: "chat:write,users:read",
    teamId: `T0TEST${teams}`,
    teamName: `Team ${teams}`,
    enterpriseId: null,
    isEnterpriseInstall: false,
    installerSlackUserId: "U0INSTALLER",
    ...overrides,
  };
}

const base64Url = (value: unknown) =>
  btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function idTokenFor(claims: {
  slackUserId: string;
  teamId: string;
  teamName?: string;
  enterpriseId?: string;
}): string {
  return [
    base64Url({ alg: "RS256", typ: "JWT" }),
    base64Url({
      iss: "https://slack.com",
      "https://slack.com/user_id": claims.slackUserId,
      "https://slack.com/team_id": claims.teamId,
      "https://slack.com/team_name": claims.teamName ?? "Team",
      ...(claims.enterpriseId ? { "https://slack.com/enterprise_id": claims.enterpriseId } : {}),
    }),
    "signature",
  ].join(".");
}

export async function slackUser(
  db: Db,
  input: { slackUserId: string; teamId: string; enterpriseId?: string },
) {
  const userId = crypto.randomUUID();
  const now = new Date("2026-11-20T10:00:00Z");
  const idToken = idTokenFor(input);
  await db.batch([
    db.insert(schema.user).values({
      id: userId,
      name: `Person ${input.slackUserId}`,
      email: `${userId}@test.local`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    }),
    db.insert(schema.account).values({
      id: crypto.randomUUID(),
      userId,
      providerId: "slack",
      accountId: input.slackUserId,
      idToken,
      createdAt: now,
      updatedAt: now,
    }),
  ]);
  return { userId, idToken };
}

export async function membersOf(db: Db, workspaceId: string) {
  return db.query.members.findMany({ where: eq(schema.members.workspaceId, workspaceId) });
}
