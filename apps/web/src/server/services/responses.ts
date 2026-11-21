import {
  anonymousTime,
  newId,
  type ResponseInput,
  type Results,
  responseInputSchema,
  summarize,
} from "@holler/core";
import { and, eq, inArray, isNull, sql } from "@holler/core/db";
import { schema } from "../db";
import { type ServiceContext, ServiceError } from "./context";

const { hollers, questions, options, recipients, responses, answers } = schema;

export type ResponseVia = "slack_button" | "slack_modal" | "web" | "api";

/**
 * Records one recipient's response. The one path every door uses: a Slack button, a Slack modal,
 * the web form and the API. It checks the Holler is live, the person is a recipient who has not
 * answered, and every answer fits its question. Then it claims the recipient row, so two submits
 * cannot both land, and writes the response and its answers in one batch. If that batch fails it
 * gives the claim back. The two steps are separate statements, so a Worker that dies between them
 * leaves the person marked answered with no response.
 *
 * Anonymous: the response row gets no person and an hour-rounded time; only the recipient row
 * says they answered. Results stay gated in core/results.ts.
 */
export async function recordResponse(
  ctx: ServiceContext,
  input: { hollerId: string; slackUserId: string; via: ResponseVia; response: ResponseInput },
): Promise<{ responseId: string }> {
  const { hollerId, slackUserId, via } = input;
  const parsed = responseInputSchema.parse(input.response);
  const holler = await ctx.db.query.hollers.findFirst({
    where: and(eq(hollers.id, hollerId), eq(hollers.workspaceId, ctx.workspaceId)),
  });
  if (!holler) throw new ServiceError("not_found", "That Holler does not exist.");
  if (holler.status !== "live") {
    throw new ServiceError("closed", "This Holler is closed, so it takes no more answers.");
  }
  const recipient = await ctx.db.query.recipients.findFirst({
    where: and(eq(recipients.hollerId, hollerId), eq(recipients.slackUserId, slackUserId)),
  });
  if (!recipient) throw new ServiceError("forbidden", "This Holler was not sent to you.");
  if (recipient.answeredAt) throw new ServiceError("conflict", "You already answered this one.");

  const qs = await ctx.db.select().from(questions).where(eq(questions.hollerId, hollerId));
  const opts =
    qs.length === 0
      ? []
      : await ctx.db
          .select()
          .from(options)
          .where(
            inArray(
              options.questionId,
              qs.map((q) => q.id),
            ),
          );

  const rows: (typeof answers.$inferInsert)[] = [];
  const responseId = newId("response");
  for (const question of qs) {
    const answer = parsed.answers.find((a) => a.questionId === question.id);
    const own = opts.filter((o) => o.questionId === question.id);
    if (question.type === "text") {
      const text = answer?.text?.trim() ?? "";
      if (!text && question.required) {
        throw new ServiceError("invalid", "This question needs an answer.", question.id);
      }
      if (text) rows.push({ id: newId("answer"), responseId, questionId: question.id, text });
      continue;
    }
    const picked = [...new Set(answer?.optionIds ?? [])];
    if (picked.some((id) => !own.some((o) => o.id === id))) {
      throw new ServiceError(
        "invalid",
        "That choice is not one of this question's options.",
        question.id,
      );
    }
    if (question.type === "single" && picked.length > 1) {
      throw new ServiceError("invalid", "Pick one option.", question.id);
    }
    if (picked.length === 0 && question.required) {
      throw new ServiceError("invalid", "This question needs an answer.", question.id);
    }
    for (const optionId of picked) {
      rows.push({ id: newId("answer"), responseId, questionId: question.id, optionId });
    }
  }
  if (parsed.answers.some((a) => !qs.some((q) => q.id === a.questionId))) {
    throw new ServiceError("invalid", "An answer names a question this Holler does not have.");
  }

  const now = ctx.now();
  // The guard on answered_at makes two simultaneous submits safe: only one claims the row.
  const claim = ctx.db
    .update(recipients)
    .set({ answeredAt: holler.anonymous ? anonymousTime(now) : now })
    .where(
      and(
        eq(recipients.hollerId, hollerId),
        eq(recipients.slackUserId, slackUserId),
        isNull(recipients.answeredAt),
      ),
    )
    .returning({ slackUserId: recipients.slackUserId });
  const [claimed] = await claim;
  if (!claimed) throw new ServiceError("conflict", "You already answered this one.");

  try {
    await ctx.db.batch([
      ctx.db.insert(responses).values({
        id: responseId,
        hollerId,
        slackUserId: holler.anonymous ? null : slackUserId,
        submittedAt: holler.anonymous ? anonymousTime(now) : now,
        via,
      }),
      // One answer per statement: D1 binds at most 100 values in one query.
      ...rows.map((row) => ctx.db.insert(answers).values(row)),
    ]);
  } catch (error) {
    // Give the claim back so the person can try again.
    await ctx.db
      .update(recipients)
      .set({ answeredAt: null })
      .where(and(eq(recipients.hollerId, hollerId), eq(recipients.slackUserId, slackUserId)));
    throw error;
  }
  return { responseId };
}

/** A Holler's results, gated for anonymous hollers. The caller checks the member may see the Holler. */
export async function resultsFor(ctx: ServiceContext, hollerId: string): Promise<Results> {
  const holler = await ctx.db.query.hollers.findFirst({
    where: and(eq(hollers.id, hollerId), eq(hollers.workspaceId, ctx.workspaceId)),
  });
  if (!holler) throw new ServiceError("not_found", "That Holler does not exist.");
  const [count] = await ctx.db
    .select({ n: sql<number>`count(*)` })
    .from(responses)
    .where(eq(responses.hollerId, hollerId));
  const responseCount = Number(count?.n ?? 0);
  const qs = await ctx.db
    .select()
    .from(questions)
    .where(eq(questions.hollerId, hollerId))
    .orderBy(questions.position);
  const opts =
    qs.length === 0
      ? []
      : await ctx.db
          .select()
          .from(options)
          .where(
            inArray(
              options.questionId,
              qs.map((q) => q.id),
            ),
          )
          .orderBy(options.position);
  const rows = await ctx.db
    .select({
      responseId: answers.responseId,
      questionId: answers.questionId,
      optionId: answers.optionId,
      text: answers.text,
      slackUserId: responses.slackUserId,
    })
    .from(answers)
    .innerJoin(responses, eq(responses.id, answers.responseId))
    .where(eq(responses.hollerId, hollerId));
  return summarize({
    anonymous: holler.anonymous,
    responseCount,
    questions: qs.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      type: q.type,
      style: q.style,
      options: opts
        .filter((o) => o.questionId === q.id)
        .map((o) => ({ id: o.id, label: o.label, score: o.score })),
    })),
    answers: rows,
  });
}
