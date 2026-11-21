import { Hono } from "hono";
import type { AppEnv } from "../app";
import type { Db } from "../db";
import type { Bindings } from "../env";
import { refreshSlackPerson } from "../services/directory-sync";
import { claimSlackDelivery } from "../services/slack-deliveries";
import { markHomeOpened, refreshHomes } from "../services/slack-home";
import { markUninstalled, workspaceIdForTeam } from "../services/workspaces";
import type { SlackUser } from "./client";
import { verifySlackRequest } from "./verify";

/**
 * Slack's Events API. Every request is signature-checked before its body is read. Slack wants an
 * answer within three seconds and retries otherwise, so each event id is claimed in
 * slack_deliveries first and a retry is dropped. docs/slack.md.
 */
interface EventEnvelope {
  type: string;
  challenge?: string;
  team_id?: string;
  event_id?: string;
  event?: {
    type: string;
    user?: SlackUser | string;
    tab?: string;
    tokens?: { oauth?: string[]; bot?: string[] };
  };
}

export const slackEventRoutes = new Hono<AppEnv>().post("/", async (c) => {
  const now = c.get("now")();
  const verified = await verifySlackRequest(c.req.raw, c.env.SLACK_SIGNING_SECRET, now);
  if (!verified.ok) return c.json({ error: verified.reason }, 401);

  let envelope: EventEnvelope;
  try {
    envelope = JSON.parse(verified.body) as EventEnvelope;
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  if (envelope.type === "url_verification") return c.json({ challenge: envelope.challenge });
  if (envelope.type !== "event_callback" || !envelope.event_id || !envelope.team_id) {
    return c.body(null, 200);
  }

  const db = c.get("db");
  if (!(await claimSlackDelivery(db, `event:${envelope.event_id}`, now))) return c.body(null, 200);
  await handleEvent(c.env, db, envelope.team_id, envelope.event, now);
  return c.body(null, 200);
});

async function handleEvent(
  env: Bindings,
  db: Db,
  teamId: string,
  event: EventEnvelope["event"],
  now: Date,
): Promise<void> {
  switch (event?.type) {
    case "app_uninstalled":
      await markUninstalled(db, teamId, now);
      return;
    case "tokens_revoked":
      // A member revoking their own sign-in token says nothing about the bot.
      if (event.tokens?.bot?.length) await markUninstalled(db, teamId, now);
      return;
    case "user_change":
    case "team_join": {
      if (!event.user || typeof event.user === "string") return;
      const workspaceId = await workspaceIdForTeam(db, teamId);
      if (workspaceId) await refreshSlackPerson(db, workspaceId, event.user, now);
      return;
    }
    case "app_home_opened": {
      if (event.tab !== "home" || typeof event.user !== "string") return;
      const workspaceId = await workspaceIdForTeam(db, teamId);
      if (!workspaceId) return;
      await markHomeOpened(db, workspaceId, event.user, now);
      await refreshHomes(env, db, workspaceId, [event.user], now, { soon: true });
      return;
    }
    default:
      return;
  }
}
