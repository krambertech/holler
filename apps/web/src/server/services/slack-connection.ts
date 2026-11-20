import { eq } from "@holler/core/db";
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
    if (String(env.DEV_ROUTES) === "true") return new FakeSlack();
    throw new ServiceError(
      "slack_unavailable",
      "Holler is not installed in this Slack workspace. Add it to Slack again from Settings.",
    );
  }
  return createSlackClient(
    await decryptToken(installation.botTokenCiphertext, env.SLACK_TOKEN_KEY),
  );
}
