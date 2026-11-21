import { Hono } from "hono";
import type { AppEnv } from "../app";
import type { Db } from "../db";
import type { Bindings } from "../env";
import {
  addNoteFromSlack,
  answerFromSlack,
  answerViewFor,
  queueOutcome,
  recipientContext,
  snoozeFromSlack,
} from "../services/answering";
import { ServiceError } from "../services/context";
import { remindWaiting } from "../services/delivery";
import { quickPulseProblems, sendQuickPulse } from "../services/quick-pulse";
import { slackFor } from "../services/slack-connection";
import { refreshHomes, slackSenderContext, timeZoneFor } from "../services/slack-home";
import { workspaceIdForTeam } from "../services/workspaces";
import { aboutMessageShortcutId, actionIds, answerViewId, quickPulseViewId } from "./blocks/format";
import { errorBlockFor, readAnswers, readOrigin } from "./blocks/modal";
import {
  emptyQuickPulse,
  quickBlockFor,
  quickFailedView,
  quickPulseDraft,
  quickPulseModal,
  quickSendingView,
  quickSentView,
  readQuickOrigin,
  readQuickValues,
  signInView,
} from "./blocks/quick-pulse";
import { verifySlackRequest } from "./verify";

/**
 * Buttons and modals. Every request is signature-checked before its body is read, and answered
 * within Slack's three seconds: the answer is recorded and the DM edit queued before the reply.
 * docs/slack.md, Answering.
 */
interface InteractionPayload {
  type: string;
  callback_id?: string;
  team?: { id: string; domain?: string } | null;
  user?: { id: string; team_id?: string };
  trigger_id?: string;
  container?: { type?: string; channel_id?: string; message_ts?: string };
  channel?: { id: string; name?: string };
  message?: { ts: string; thread_ts?: string };
  actions?: { action_id: string; block_id?: string; value?: string }[];
  view?: {
    id?: string;
    hash?: string;
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
  const base = { db, workspaceId, now };

  // Send a Holler about this: a quick pulse with the message linked in its description.
  if (payload.type === "message_action" && payload.callback_id === aboutMessageShortcutId) {
    if (!payload.trigger_id) return c.body(null, 200);
    const slack = await slackFor(c.env, db, workspaceId);
    const sender = await slackSenderContext(base, slackUserId);
    const url = permalinkOf(payload);
    await slack.openView({
      triggerId: payload.trigger_id,
      view: sender
        ? quickPulseModal({ about: url ? { url } : null }, emptyQuickPulse, c.env.PRODUCT_URL)
        : signInView(c.env.PRODUCT_URL),
    });
    return c.body(null, 200);
  }

  if (payload.type === "view_submission" && payload.view?.callback_id === quickPulseViewId) {
    const sender = await slackSenderContext(base, slackUserId);
    if (!sender) return c.json({ response_action: "update", view: signInView(c.env.PRODUCT_URL) });
    const origin = readQuickOrigin(payload.view.private_metadata);
    const values = readQuickValues(payload.view.state?.values);
    const read = quickPulseDraft(origin, values);
    if ("errors" in read) return c.json({ response_action: "errors", errors: read.errors });
    // The service's own checks, before anything is saved, beside the field at fault.
    const problems = quickPulseProblems(sender, read.draft);
    if (problems.length > 0) {
      const errors: Record<string, string> = {};
      for (const problem of problems) errors[quickBlockFor(problem.field)] ??= problem.message;
      return c.json({ response_action: "errors", errors });
    }
    const viewId = payload.view.id;
    if (!viewId) return c.json({ response_action: "clear" });
    // Resolving channels can take longer than Slack waits, so the send finishes after the reply
    // and rewrites the modal with how it went.
    c.executionCtx.waitUntil(
      finishQuickPulse(c.env, db, sender, read.draft, viewId).catch((error) =>
        console.error("quick pulse failed", error),
      ),
    );
    return c.json({ response_action: "update", view: quickSendingView(values.prompt) });
  }

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
    // Opened from App Home, where the person is looking: their Home drops it now.
    if (!tapped) await refreshHomes(c.env, db, workspaceId, [slackUserId], now(), { soon: true });
    return c.json({ response_action: "clear" });
  }

  if (payload.type !== "block_actions") return c.body(null, 200);
  const action = payload.actions?.[0];
  if (action?.action_id === actionIds.quickKind && payload.view?.id) {
    // The Answers menu changed: redraw with or without the options box, keeping what is typed.
    const slack = await slackFor(c.env, db, workspaceId);
    await slack.updateView({
      viewId: payload.view.id,
      view: quickPulseModal(
        readQuickOrigin(payload.view.private_metadata),
        readQuickValues(payload.view.state?.values),
        c.env.PRODUCT_URL,
      ),
    });
    return c.body(null, 200);
  }
  if (!action?.value) return c.body(null, 200);
  const fromHome = payload.container?.type === "view" && !payload.view?.callback_id;

  if (action.action_id === actionIds.homeNew && payload.trigger_id) {
    const sender = await slackSenderContext(base, slackUserId);
    const slack = await slackFor(c.env, db, workspaceId);
    await slack.openView({
      triggerId: payload.trigger_id,
      view: sender
        ? quickPulseModal({ about: null }, emptyQuickPulse, c.env.PRODUCT_URL)
        : signInView(c.env.PRODUCT_URL),
    });
    return c.body(null, 200);
  }
  if (action.action_id === actionIds.homeRemind) {
    const sender = await slackSenderContext(base, slackUserId);
    if (!sender) return c.body(null, 200);
    try {
      await remindWaiting(sender, c.env, action.value);
    } catch (error) {
      // Too soon, nobody waiting or closed: the Home is redrawn to show which.
      if (!(error instanceof ServiceError)) throw error;
    }
    await refreshHomes(c.env, db, workspaceId, [slackUserId], now(), { soon: true });
    return c.body(null, 200);
  }
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
    if (fromHome) await refreshHomes(c.env, db, workspaceId, [slackUserId], now(), { soon: true });
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

/**
 * A link to the message a shortcut was used on. Slack's permalink shape, built here because the
 * trigger id expires before a chat.getPermalink call could come back.
 */
export function permalinkOf(payload: InteractionPayload): string | null {
  const domain = payload.team?.domain;
  const channel = payload.channel?.id;
  const ts = payload.message?.ts;
  if (!domain || !channel || !ts || !/^[a-z0-9-]+$/.test(domain) || !/^\d+\.\d+$/.test(ts)) {
    return null;
  }
  return `https://${domain}.slack.com/archives/${channel}/p${ts.replace(".", "")}`;
}

/** Sends the quick pulse after Slack has its answer, then rewrites the modal with the outcome. */
async function finishQuickPulse(
  env: Bindings,
  db: Db,
  sender: NonNullable<Awaited<ReturnType<typeof slackSenderContext>>>,
  draft: Parameters<typeof sendQuickPulse>[2],
  viewId: string,
) {
  const outcome = await sendQuickPulse(sender, env, draft, viewId);
  const slack = await slackFor(env, db, sender.workspaceId);
  const slackUserId = "slackUserId" in sender.actor ? sender.actor.slackUserId : "";
  const view =
    outcome.status === "sent"
      ? quickSentView(
          outcome,
          { timeZone: await timeZoneFor(db, sender.workspaceId, slackUserId), now: sender.now() },
          env.PRODUCT_URL,
        )
      : quickFailedView(outcome, env.PRODUCT_URL);
  await slack.updateView({ viewId, view });
}
