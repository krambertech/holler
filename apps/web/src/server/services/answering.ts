import type { ResponseInput } from "@holler/core";
import { and, eq } from "@holler/core/db";
import { schema } from "../db";
import type { Bindings } from "../env";
import { answerModal } from "../slack/blocks/modal";
import type { SlackView } from "../slack/client";
import { auditStatement } from "./audit";
import { type ServiceContext, ServiceError } from "./context";
import { type DmRef, enqueue, loadSlackHoller, type SlackSend } from "./delivery";
import { snoozeReminder } from "./reminders";
import { type ResponseVia, recordResponse } from "./responses";

/**
 * What a recipient does in Slack: answer with a button or the modal, mark a form submitted,
 * snooze a reminder. /slack/interactions parses the payload and calls these. Every DM edit goes
 * through the queue, so a rate limit retries it instead of losing it. docs/slack.md, Answering.
 */

export type SlackAnswerOutcome =
  | { status: "answered"; responseId: string }
  | { status: "closed" }
  | { status: "already" }
  | { status: "invalid"; message: string; questionId: string };

export function recipientContext(
  base: Omit<ServiceContext, "actor">,
  slackUserId: string,
): ServiceContext {
  return { ...base, actor: { via: "slack", recipientSlackUserId: slackUserId } };
}

function slackUserOf(ctx: ServiceContext): string {
  if (!("recipientSlackUserId" in ctx.actor)) {
    throw new ServiceError("forbidden", "This is for the person the Holler was sent to.");
  }
  return ctx.actor.recipientSlackUserId;
}

/**
 * Records an answer from Slack. A closed Holler or a second answer is an outcome the DM shows,
 * not an error. An answer that does not fit a question is an outcome the modal shows beside it;
 * any other refusal is thrown.
 */
export async function answerFromSlack(
  ctx: ServiceContext,
  hollerId: string,
  via: ResponseVia,
  response: ResponseInput,
): Promise<SlackAnswerOutcome> {
  const slackUserId = slackUserOf(ctx);
  try {
    const { responseId } = await recordResponse(ctx, { hollerId, slackUserId, via, response });
    return { status: "answered", responseId };
  } catch (error) {
    if (!(error instanceof ServiceError)) throw error;
    if (error.code === "closed") return { status: "closed" };
    if (error.code === "conflict") return { status: "already" };
    if (error.code === "invalid" && error.field) {
      return { status: "invalid", message: error.message, questionId: error.field };
    }
    throw error;
  }
}

/** Puts the DM right after an answer or a stale tap, and moves the announcement's count. */
export async function queueOutcome(
  env: Bindings,
  ctx: ServiceContext,
  hollerId: string,
  outcome: Exclude<SlackAnswerOutcome, { status: "invalid" }>,
  tapped: DmRef | null,
): Promise<void> {
  const slackUserId = slackUserOf(ctx);
  const also = tapped ?? undefined;
  const responseId = outcome.status === "answered" ? outcome.responseId : undefined;
  const sends: SlackSend[] =
    outcome.status === "closed"
      ? [{ kind: "closed", hollerId, slackUserId, also }]
      : [{ kind: "answered", hollerId, slackUserId, also, responseId }];
  if (outcome.status === "answered") sends.push({ kind: "announce", hollerId });
  await enqueue(env, sends);
}

/**
 * The answer modal for this person, or why there is none: it closed, or they answered. Refuses
 * anyone the Holler was not sent to.
 */
export async function answerViewFor(
  ctx: ServiceContext,
  hollerId: string,
  origin: DmRef | null,
): Promise<{ view: SlackView } | { status: "closed" | "already" }> {
  const slackUserId = slackUserOf(ctx);
  const loaded = await loadSlackHoller(ctx.db, hollerId);
  if (!loaded || loaded.row.workspaceId !== ctx.workspaceId) {
    throw new ServiceError("not_found", "That Holler does not exist.");
  }
  const recipient = await ctx.db.query.recipients.findFirst({
    where: and(
      eq(schema.recipients.hollerId, hollerId),
      eq(schema.recipients.slackUserId, slackUserId),
    ),
  });
  if (!recipient) throw new ServiceError("forbidden", "This Holler was not sent to you.");
  if (loaded.row.status !== "live") return { status: "closed" };
  if (recipient.answeredAt) return { status: "already" };
  return {
    view: answerModal(loaded.holler, {
      hollerId,
      channel: origin?.channel ?? "",
      ts: origin?.ts ?? "",
    }),
  };
}

/**
 * Remind me later: the snooze is stored before Slack gets its answer, and the reminder they
 * tapped is rewritten to say when the next one comes. When there is nothing to snooze, because
 * they answered or it closed, the DM is put right instead.
 */
export async function snoozeFromSlack(
  env: Bindings,
  ctx: ServiceContext,
  hollerId: string,
  tapped: DmRef | null,
): Promise<void> {
  const slackUserId = slackUserOf(ctx);
  const snoozed = await snoozeReminder(ctx, hollerId, slackUserId);
  if (!snoozed) {
    const loaded = await loadSlackHoller(ctx.db, hollerId);
    const status = loaded?.row.status === "live" ? "already" : "closed";
    await queueOutcome(env, ctx, hollerId, { status }, tapped);
    return;
  }
  if (tapped) await enqueue(env, [{ kind: "snoozed", hollerId, slackUserId, reminder: tapped }]);
}

/**
 * The follow-up note typed into the DM after a tap. The response id comes from the person's own
 * message, so a note on an anonymous Holler finds its response without Holler having stored who
 * gave it. A note is optional and written once: an empty box saves nothing, and a second note is
 * ignored. Then the DM is put right, without the box.
 */
export async function addNoteFromSlack(
  env: Bindings,
  ctx: ServiceContext,
  input: { responseId: string; questionId: string; note: string },
  tapped: DmRef | null,
): Promise<void> {
  const slackUserId = slackUserOf(ctx);
  const note = input.note.trim();
  const response = await ctx.db.query.responses.findFirst({
    where: eq(schema.responses.id, input.responseId),
  });
  if (!response) throw new ServiceError("not_found", "That answer does not exist.");
  const holler = await ctx.db.query.hollers.findFirst({
    where: and(
      eq(schema.hollers.id, response.hollerId),
      eq(schema.hollers.workspaceId, ctx.workspaceId),
    ),
  });
  if (!holler) throw new ServiceError("not_found", "That Holler does not exist.");
  // A named response belongs to one person; an anonymous one is found only by its id.
  if (response.slackUserId !== null && response.slackUserId !== slackUserId) {
    throw new ServiceError("forbidden", "That answer is someone else's.");
  }
  if (holler.status !== "live") {
    await queueOutcome(env, ctx, holler.id, { status: "closed" }, tapped);
    return;
  }
  const question = await ctx.db.query.questions.findFirst({
    where: and(eq(schema.questions.id, input.questionId), eq(schema.questions.hollerId, holler.id)),
  });
  if (!question?.followUpPrompt) {
    throw new ServiceError("invalid", "This question does not ask for a note.");
  }
  if (note) {
    const [added] = await ctx.db
      .insert(schema.answerNotes)
      .values({ responseId: response.id, questionId: question.id, kind: "note", text: note })
      .onConflictDoNothing()
      .returning({ responseId: schema.answerNotes.responseId });
    // Never the note's words or its writer: Activity says only that a note was added.
    if (added) {
      await auditStatement(ctx, {
        action: "response.noted",
        subjectType: "holler",
        subjectId: holler.id,
      });
    }
  }
  await queueOutcome(env, ctx, holler.id, { status: "already" }, tapped);
}
