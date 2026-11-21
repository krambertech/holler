import { Hono } from "hono";
import type { AppEnv } from "../app";
import { slackFor } from "../services/slack-connection";
import { senderState, slackSenderContext, timeZoneFor } from "../services/slack-home";
import { workspaceIdForTeam } from "../services/workspaces";
import { helpMessage, resultsMessage, signInMessage } from "./blocks/commands";
import { emptyQuickPulse, quickPulseModal } from "./blocks/quick-pulse";
import { verifySlackRequest } from "./verify";

export const slackCommandRoutes = new Hono<AppEnv>().post("/", async (c) => {
  const now = c.get("now");
  const verified = await verifySlackRequest(c.req.raw, c.env.SLACK_SIGNING_SECRET, now());
  if (!verified.ok) return c.json({ error: verified.reason }, 401);

  const form = new URLSearchParams(verified.body);
  const teamId = form.get("team_id");
  const slackUserId = form.get("user_id");
  const triggerId = form.get("trigger_id");
  const text = (form.get("text") ?? "").trim();
  if (!teamId || !slackUserId) return c.body(null, 200);
  const db = c.get("db");
  const workspaceId = await workspaceIdForTeam(db, teamId);
  if (!workspaceId) return c.body(null, 200);

  const word = text.toLocaleLowerCase();
  if (word === "help") return c.json(helpMessage());
  const ctx = await slackSenderContext({ db, workspaceId, now }, slackUserId);
  if (!ctx) return c.json(signInMessage(c.env.PRODUCT_URL));

  if (word === "results") {
    const [sender, timeZone] = await Promise.all([
      senderState(ctx, now()),
      timeZoneFor(db, workspaceId, slackUserId),
    ]);
    return c.json(resultsMessage(sender, { timeZone, now: now(), productUrl: c.env.PRODUCT_URL }));
  }
  if (!triggerId) return c.json(helpMessage());
  const slack = await slackFor(c.env, db, workspaceId);
  await slack.openView({
    triggerId,
    view: quickPulseModal(
      { about: null },
      { ...emptyQuickPulse, prompt: text.slice(0, 300) },
      c.env.PRODUCT_URL,
    ),
  });
  return c.body(null, 200);
});
