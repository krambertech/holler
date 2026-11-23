import { type Context, Hono } from "hono";
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
import { refreshHomes } from "../services/home-queue";
import {
  type QuickPulseOutcome,
  quickPulseProblems,
  quickPulseUnsavedMessage,
  sendQuickPulse,
} from "../services/quick-pulse";
import { slackFor } from "../services/slack-connection";
import { slackSenderContext, timeZoneFor } from "../services/slack-home";
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

interface Interaction {
  c: Context<AppEnv>;
  payload: InteractionPayload;
  slackUserId: string;
  workspaceId: string;
  base: { db: Db; workspaceId: string; now: () => Date };
  ctx: ReturnType<typeof recipientContext>;
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
  const base = { db, workspaceId, now };
  const interaction: Interaction = {
    c,
    payload,
    slackUserId,
    workspaceId,
    base,
    ctx: recipientContext(base, slackUserId),
  };
  if (payload.type === "message_action") return openFromShortcut(interaction);
  if (payload.type === "view_submission") return submitView(interaction);
  if (payload.type === "block_actions") return blockAction(interaction);
  return c.body(null, 200);
});

async function openQuickPulse(
  { c, base, slackUserId, workspaceId }: Interaction,
  triggerId: string,
  about: { url: string } | null,
) {
  const slack = await slackFor(c.env, base.db, workspaceId);
  const sender = await slackSenderContext(base, slackUserId);
  await slack.openView({
    triggerId,
    view: sender
      ? quickPulseModal({ about }, emptyQuickPulse, c.env.PRODUCT_URL)
      : signInView(c.env.PRODUCT_URL),
  });
  return c.body(null, 200);
}

async function openFromShortcut(interaction: Interaction) {
  const { c, payload } = interaction;
  if (payload.callback_id !== aboutMessageShortcutId || !payload.trigger_id) {
    return c.body(null, 200);
  }
  const url = permalinkOf(payload);
  return openQuickPulse(interaction, payload.trigger_id, url ? { url } : null);
}

async function submitView(interaction: Interaction) {
  const callbackId = interaction.payload.view?.callback_id;
  if (callbackId === quickPulseViewId) return submitQuickPulse(interaction);
  if (callbackId === answerViewId) return submitAnswer(interaction);
  return interaction.c.body(null, 200);
}

async function submitQuickPulse({ c, payload, base, slackUserId }: Interaction) {
  const sender = await slackSenderContext(base, slackUserId);
  if (!sender) return c.json({ response_action: "update", view: signInView(c.env.PRODUCT_URL) });
  const values = readQuickValues(payload.view?.state?.values);
  const read = quickPulseDraft(readQuickOrigin(payload.view?.private_metadata), values);
  if ("errors" in read) return c.json({ response_action: "errors", errors: read.errors });
  const problems = quickPulseProblems(sender, read.draft);
  if (problems.length > 0) {
    const errors: Record<string, string> = {};
    for (const problem of problems) errors[quickBlockFor(problem.field)] ??= problem.message;
    return c.json({ response_action: "errors", errors });
  }
  const viewId = payload.view?.id;
  if (!viewId) return c.json({ response_action: "clear" });
  c.executionCtx.waitUntil(
    finishQuickPulse(c.env, base.db, sender, read.draft, viewId).catch((error) =>
      console.error("quick pulse failed", error),
    ),
  );
  return c.json({ response_action: "update", view: quickSendingView(values.prompt) });
}

async function submitAnswer({ c, payload, base, ctx, slackUserId, workspaceId }: Interaction) {
  const origin = readOrigin(payload.view?.private_metadata);
  if (!origin) return c.json({ response_action: "clear" });
  const outcome = await answerFromSlack(
    ctx,
    origin.hollerId,
    "slack_modal",
    readAnswers(payload.view?.state?.values),
  );
  if (outcome.status === "invalid") {
    return c.json({
      response_action: "errors",
      errors: { [errorBlockFor(outcome.questionId)]: outcome.message },
    });
  }
  const tapped = origin.channel && origin.ts ? { channel: origin.channel, ts: origin.ts } : null;
  await queueOutcome(c.env, ctx, origin.hollerId, outcome, tapped);
  if (!tapped) await refreshOwnHome({ c, base, slackUserId, workspaceId });
  return c.json({ response_action: "clear" });
}

function refreshOwnHome({
  c,
  base,
  slackUserId,
  workspaceId,
}: Pick<Interaction, "c" | "base" | "slackUserId" | "workspaceId">) {
  return refreshHomes(c.env, base.db, workspaceId, [slackUserId], base.now(), { soon: true });
}

type Action = NonNullable<InteractionPayload["actions"]>[number] & { value: string };

async function blockAction(interaction: Interaction) {
  const { c, payload } = interaction;
  const action = payload.actions?.[0];
  if (action?.action_id === actionIds.quickKind) return redrawQuickPulse(interaction);
  if (!action?.value) return c.body(null, 200);
  const valued = { ...action, value: action.value };
  if (action.action_id === actionIds.homeNew) {
    return payload.trigger_id
      ? openQuickPulse(interaction, payload.trigger_id, null)
      : c.body(null, 200);
  }
  if (action.action_id === actionIds.homeRemind) return remindFromHome(interaction, valued);
  await answerAction(interaction, valued);
  return c.body(null, 200);
}

async function redrawQuickPulse({ c, payload, base, workspaceId }: Interaction) {
  const viewId = payload.view?.id;
  if (!viewId) return c.body(null, 200);
  const slack = await slackFor(c.env, base.db, workspaceId);
  await slack.updateView({
    viewId,
    view: quickPulseModal(
      readQuickOrigin(payload.view?.private_metadata),
      readQuickValues(payload.view?.state?.values),
      c.env.PRODUCT_URL,
    ),
  });
  return c.body(null, 200);
}

async function remindFromHome(interaction: Interaction, action: Action) {
  const { c, base, slackUserId } = interaction;
  const sender = await slackSenderContext(base, slackUserId);
  if (!sender) return c.body(null, 200);
  try {
    await remindWaiting(sender, c.env, action.value);
  } catch (error) {
    if (!(error instanceof ServiceError)) throw error;
  }
  await refreshOwnHome(interaction);
  return c.body(null, 200);
}

function tappedMessage(payload: InteractionPayload) {
  const channel = payload.container?.channel_id ?? payload.channel?.id;
  const ts = payload.container?.message_ts ?? payload.message?.ts;
  return channel && ts ? { channel, ts } : null;
}

async function answerAction(interaction: Interaction, action: Action) {
  const { c, ctx, payload } = interaction;
  const tapped = tappedMessage(payload);
  if (action.action_id.startsWith(`${actionIds.option}_`)) {
    const [hollerId, questionId, optionId] = action.value.split("|");
    if (!hollerId || !questionId || !optionId) return;
    const outcome = await answerFromSlack(ctx, hollerId, "slack_button", {
      answers: [{ questionId, optionIds: [optionId] }],
    });
    // A one-tap question has one required answer, so a button can never be invalid.
    if (outcome.status === "invalid") throw new Error(outcome.message);
    await queueOutcome(c.env, ctx, hollerId, outcome, tapped);
    return;
  }
  if (action.action_id === actionIds.text) {
    // The free-text pulse's box: block `text:<holler>:<question>`. Enter on an empty box does nothing.
    const [, hollerId, questionId] = action.block_id?.split(":") ?? [];
    if (!hollerId || !questionId || !action.value.trim()) return;
    const outcome = await answerFromSlack(ctx, hollerId, "slack_button", {
      answers: [{ questionId, text: action.value }],
    });
    if (outcome.status === "invalid") throw new Error(outcome.message);
    await queueOutcome(c.env, ctx, hollerId, outcome, tapped);
    return;
  }
  if (action.action_id === actionIds.note) {
    // The note box after a tap: block `note:<response>:<question>`.
    const [, responseId, questionId] = action.block_id?.split(":") ?? [];
    if (!responseId || !questionId) return;
    await addNoteFromSlack(c.env, ctx, { responseId, questionId, note: action.value }, tapped);
    return;
  }
  await answerOrOpen(interaction, action, tapped);
}

async function answerOrOpen(
  interaction: Interaction,
  action: Action,
  tapped: ReturnType<typeof tappedMessage>,
) {
  const { c, ctx, payload, base, workspaceId } = interaction;
  if (action.action_id === actionIds.done) {
    const outcome = await answerFromSlack(ctx, action.value, "slack_button", { answers: [] });
    if (outcome.status === "invalid") throw new Error(outcome.message);
    await queueOutcome(c.env, ctx, action.value, outcome, tapped);
    const fromHome = payload.container?.type === "view" && !payload.view?.callback_id;
    if (fromHome) await refreshOwnHome(interaction);
    return;
  }
  if (action.action_id === actionIds.open && payload.trigger_id) {
    const opened = await answerViewFor(ctx, action.value, tapped);
    if ("view" in opened) {
      // The trigger id lasts three seconds, so the modal opens before anything else runs.
      const slack = await slackFor(c.env, base.db, workspaceId);
      await slack.openView({ triggerId: payload.trigger_id, view: opened.view });
    } else {
      await queueOutcome(c.env, ctx, action.value, opened, tapped);
    }
    return;
  }
  if (action.action_id === actionIds.snooze) {
    await snoozeFromSlack(c.env, ctx, action.value, tapped);
  }
  // Link buttons report their tap too; there is nothing to do.
}

export function permalinkOf(payload: InteractionPayload): string | null {
  const domain = payload.team?.domain;
  const channel = payload.channel?.id;
  const ts = payload.message?.ts;
  if (!domain || !channel || !ts || !/^[a-z0-9-]+$/.test(domain) || !/^\d+\.\d+$/.test(ts)) {
    return null;
  }
  return `https://${domain}.slack.com/archives/${channel}/p${ts.replace(".", "")}`;
}

async function finishQuickPulse(
  env: Bindings,
  db: Db,
  sender: NonNullable<Awaited<ReturnType<typeof slackSenderContext>>>,
  draft: Parameters<typeof sendQuickPulse>[2],
  viewId: string,
) {
  const outcome = await sendQuickPulse(sender, env, draft, viewId).catch(
    (error: unknown): QuickPulseOutcome => {
      console.error("quick pulse failed", error);
      return { status: "failed", hollerId: null, message: quickPulseUnsavedMessage };
    },
  );
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
