import { Hono } from "hono";
import type { AppEnv } from "../app";
import {
  addNoteFromSlack,
  answerFromSlack,
  answerViewFor,
  queueOutcome,
  recipientContext,
  snoozeFromSlack,
} from "../services/answering";
import { slackFor } from "../services/slack-connection";
import { workspaceIdForTeam } from "../services/workspaces";
import { actionIds, answerViewId } from "./blocks/format";
import { errorBlockFor, readAnswers, readOrigin } from "./blocks/modal";
import { verifySlackRequest } from "./verify";

/**
 * Buttons and modals. Every request is signature-checked before its body is read, and answered
 * within Slack's three seconds: the answer is recorded and the DM edit queued before the reply.
 * docs/slack.md, Answering.
 */
interface InteractionPayload {
  type: string;
  team?: { id: string } | null;
  user?: { id: string; team_id?: string };
  trigger_id?: string;
  container?: { channel_id?: string; message_ts?: string };
  channel?: { id: string };
  message?: { ts: string };
  actions?: { action_id: string; block_id?: string; value?: string }[];
  view?: {
    callback_id?: string;
    private_metadata?: string;
    state?: { values?: Parameters<typeof readAnswers>[0] };
  };
}

export const slackInteractionRoutes = new Hono<AppEnv>().post("/", async (c) => {
  const now = c.get("now");
  const verified = await verifySlackRequest(c.req.raw, c.env.SLACK_SIGNING_SECRET, now());
  if (!verified.ok) return c.json({ error: verified.reason }, 401);

  let payload: InteractionPayload;
  try {
    const raw = new URLSearchParams(verified.body).get("payload") ?? "";
    payload = JSON.parse(raw) as InteractionPayload;
  } catch {
    return c.json({ error: "invalid_payload" }, 400);
  }
  const teamId = payload.team?.id ?? payload.user?.team_id;
  const slackUserId = payload.user?.id;
  if (!teamId || !slackUserId) return c.body(null, 200);
  const db = c.get("db");
  const workspaceId = await workspaceIdForTeam(db, teamId);
  if (!workspaceId) return c.body(null, 200);
  const ctx = recipientContext({ db, workspaceId, now }, slackUserId);

  if (payload.type === "view_submission" && payload.view?.callback_id === answerViewId) {
    const origin = readOrigin(payload.view.private_metadata);
    if (!origin) return c.json({ response_action: "clear" });
    const outcome = await answerFromSlack(
      ctx,
      origin.hollerId,
      "slack_modal",
      readAnswers(payload.view.state?.values),
    );
    if (outcome.status === "invalid") {
      return c.json({
        response_action: "errors",
        errors: { [errorBlockFor(outcome.questionId)]: outcome.message },
      });
    }
    const tapped = origin.channel && origin.ts ? { channel: origin.channel, ts: origin.ts } : null;
    await queueOutcome(c.env, ctx, origin.hollerId, outcome, tapped);
    return c.json({ response_action: "clear" });
  }

  if (payload.type !== "block_actions") return c.body(null, 200);
  const action = payload.actions?.[0];
  if (!action?.value) return c.body(null, 200);
  const channel = payload.container?.channel_id ?? payload.channel?.id;
  const ts = payload.container?.message_ts ?? payload.message?.ts;
  const tapped = channel && ts ? { channel, ts } : null;

  if (action.action_id.startsWith(`${actionIds.option}_`)) {
    const [hollerId, questionId, optionId] = action.value.split("|");
    if (!hollerId || !questionId || !optionId) return c.body(null, 200);
    const outcome = await answerFromSlack(ctx, hollerId, "slack_button", {
      answers: [{ questionId, optionIds: [optionId] }],
    });
    // A one-tap question has one required answer, so a button can never be invalid.
    if (outcome.status === "invalid") throw new Error(outcome.message);
    await queueOutcome(c.env, ctx, hollerId, outcome, tapped);
    return c.body(null, 200);
  }
  if (action.action_id === actionIds.text) {
    // The free-text pulse's box: block `text:<holler>:<question>`. Enter on an empty box does nothing.
    const [, hollerId, questionId] = action.block_id?.split(":") ?? [];
    if (!hollerId || !questionId || !action.value.trim()) return c.body(null, 200);
    const outcome = await answerFromSlack(ctx, hollerId, "slack_button", {
      answers: [{ questionId, text: action.value }],
    });
    if (outcome.status === "invalid") throw new Error(outcome.message);
    await queueOutcome(c.env, ctx, hollerId, outcome, tapped);
    return c.body(null, 200);
  }
  if (action.action_id === actionIds.note) {
    // The note box after a tap: block `note:<response>:<question>`.
    const [, responseId, questionId] = action.block_id?.split(":") ?? [];
    if (!responseId || !questionId) return c.body(null, 200);
    await addNoteFromSlack(c.env, ctx, { responseId, questionId, note: action.value }, tapped);
    return c.body(null, 200);
  }
  if (action.action_id === actionIds.done) {
    const outcome = await answerFromSlack(ctx, action.value, "slack_button", { answers: [] });
    if (outcome.status === "invalid") throw new Error(outcome.message);
    await queueOutcome(c.env, ctx, action.value, outcome, tapped);
    return c.body(null, 200);
  }
  if (action.action_id === actionIds.open && payload.trigger_id) {
    const opened = await answerViewFor(ctx, action.value, tapped);
    if ("view" in opened) {
      // The trigger id lasts three seconds, so the modal opens before anything else runs.
      const slack = await slackFor(c.env, db, workspaceId);
      await slack.openView({ triggerId: payload.trigger_id, view: opened.view });
    } else {
      await queueOutcome(c.env, ctx, action.value, opened, tapped);
    }
    return c.body(null, 200);
  }
  if (action.action_id === actionIds.snooze) {
    await snoozeFromSlack(c.env, ctx, action.value, tapped);
    return c.body(null, 200);
  }
  // Link buttons report their tap too; there is nothing to do.
  return c.body(null, 200);
});
