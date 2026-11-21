import { and, eq } from "@holler/core/db";
import { type Db, schema } from "../db";
import type { Bindings } from "../env";
import { createSlackClient, type SlackClient } from "../slack/client";
import { FakeSlack } from "../slack/fake";
import { decryptToken } from "../slack/tokens";
import { ServiceError } from "./context";

/**
 * The Slack client for one workspace, from its stored bot token. Every Slack call a service makes
 * starts here. With DEV_ROUTES on and no installation, it returns a FakeSlack, so local
 * development sends nothing real and still exercises the whole path.
 */
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

/**
 * One FakeSlack per workspace for the life of the isolate, so local development and tests can
 * read back what Holler sent (`/api/dev/state`). It starts with the workspace's directory, and
 * every group and channel holds everyone, so an audience resolves the way it would in Slack.
 */
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
  const ids = people.map((person) => person.slackUserId);
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
        members: ids,
      })),
    groups
      .filter((group) => group.kind === "channel")
      .map((group) => ({ id: group.slackId, name: group.name })),
  );
  devFakes.set(workspaceId, fake);
  return fake;
}

/** What the dev FakeSlack recorded for a workspace, or nothing when it was never used. */
export function devSlackRecord(workspaceId: string): FakeSlack | undefined {
  return devFakes.get(workspaceId);
}

/** Forgets the dev FakeSlack, so a reseeded workspace starts with an empty record. */
export function forgetDevSlack(workspaceId: string): void {
  devFakes.delete(workspaceId);
}
