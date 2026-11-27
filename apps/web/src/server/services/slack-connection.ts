import { and, eq } from "@holler/core/db";
import { type Db, schema } from "../db";
import type { Bindings } from "../env";
import { createSlackClient, type SlackClient } from "../slack/client";
import { FakeSlack } from "../slack/fake";
import { decryptToken } from "../slack/tokens";
import { ServiceError } from "./context";

export async function slackFor(env: Bindings, db: Db, workspaceId: string): Promise<SlackClient> {
  const installation = await db.query.slackInstallations.findFirst({
    where: eq(schema.slackInstallations.workspaceId, workspaceId),
  });
  if (!installation) {
    if (String(env.DEV_ROUTES) === "true") return devSlack(db, workspaceId);
    throw new ServiceError(
      "slack_unavailable",
      "Holler is not installed in this Slack workspace. Add it to Slack again from Settings.",
    );
  }
  return createSlackClient(
    await decryptToken(installation.botTokenCiphertext, env.SLACK_TOKEN_KEY),
  );
}

const devFakes = new Map<string, FakeSlack>();

export async function devSlack(db: Db, workspaceId: string): Promise<FakeSlack> {
  const known = devFakes.get(workspaceId);
  if (known) return known;
  const [people, groups] = await Promise.all([
    db.query.slackPeople.findMany({
      where: and(
        eq(schema.slackPeople.workspaceId, workspaceId),
        eq(schema.slackPeople.isBot, false),
        eq(schema.slackPeople.isDeleted, false),
      ),
    }),
    db.query.slackGroups.findMany({ where: eq(schema.slackGroups.workspaceId, workspaceId) }),
  ]);
  const ids = people.map((person) => person.slackUserId).sort();
  const fake = new FakeSlack(
    people.map((person) => ({
      id: person.slackUserId,
      name: person.name,
      ...(person.timeZone ? { tz: person.timeZone } : {}),
    })),
    groups
      .filter((group) => group.kind === "usergroup")
      .map((group) => ({
        id: group.slackId,
        name: group.name,
        handle: group.handle ?? "",
        members: group.memberCount == null ? ids : ids.slice(0, group.memberCount),
      })),
    groups
      .filter((group) => group.kind === "channel")
      .map((group) => ({ id: group.slackId, name: group.name })),
  );
  devFakes.set(workspaceId, fake);
  return fake;
}

export function devSlackRecord(workspaceId: string): FakeSlack | undefined {
  return devFakes.get(workspaceId);
}

export function forgetDevSlack(workspaceId: string): void {
  devFakes.delete(workspaceId);
}
