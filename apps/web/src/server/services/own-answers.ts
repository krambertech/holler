import {
  hollerTitle,
  type OwnAnswer,
  type OwnGiven,
  type OwnHoller,
  ownAnswerState,
} from "@holler/core";
import { and, desc, eq, inArray, isNotNull, or, sql } from "@holler/core/db";
import { schema } from "../db";
import { type ServiceContext, ServiceError } from "./context";

const {
  hollers,
  members,
  questions,
  options,
  recipients,
  responses,
  responseOwners,
  answers,
  answerNotes,
  slackPeople,
  workspaces,
  user,
} = schema;

const historyLimit = 500;

function personOf(ctx: ServiceContext): string {
  if ("recipientSlackUserId" in ctx.actor && ctx.actor.recipientSlackUserId) {
    return ctx.actor.recipientSlackUserId;
  }
  if ("slackUserId" in ctx.actor) return ctx.actor.slackUserId;
  throw new ServiceError("forbidden", "Sign in with Slack to see your answers.");
}

const iso = (at: Date | null) => at?.toISOString() ?? null;

function slackUrl(teamId: string, channelId: string | null): string | null {
  if (!channelId) return null;
  const url = new URL("https://slack.com/app_redirect");
  url.searchParams.set("team", teamId);
  url.searchParams.set("channel", channelId);
  return url.toString();
}

function ownRows(ctx: ServiceContext, slackUserId: string, hollerId?: string) {
  const filters = [
    eq(hollers.workspaceId, ctx.workspaceId),
    eq(recipients.slackUserId, slackUserId),
    isNotNull(recipients.invitedAt),
    inArray(hollers.status, ["live", "closed"]),
  ];
  if (hollerId) filters.push(eq(hollers.id, hollerId));
  return ctx.db
    .select({
      holler: hollers,
      answeredAt: recipients.answeredAt,
      dmChannelId: recipients.dmChannelId,
      teamId: workspaces.slackTeamId,
      senderDisplayName: slackPeople.displayName,
      senderName: slackPeople.name,
      senderSignInName: user.name,
      firstPrompt: sql<
        string | null
      >`(select ${questions.prompt} from ${questions} where ${questions.hollerId} = ${hollers.id} order by ${questions.position} limit 1)`,
    })
    .from(recipients)
    .innerJoin(hollers, eq(hollers.id, recipients.hollerId))
    .innerJoin(workspaces, eq(workspaces.id, hollers.workspaceId))
    .innerJoin(members, eq(members.id, hollers.creatorId))
    .innerJoin(user, eq(user.id, members.userId))
    .leftJoin(
      slackPeople,
      and(
        eq(slackPeople.workspaceId, members.workspaceId),
        eq(slackPeople.slackUserId, members.slackUserId),
      ),
    )
    .where(and(...filters))
    .orderBy(desc(sql`coalesce(${recipients.answeredAt}, ${recipients.invitedAt})`))
    .limit(historyLimit);
}

type OwnRow = Awaited<ReturnType<typeof ownRows>>[number];

function present(row: OwnRow): OwnHoller {
  const state = ownAnswerState({ answeredAt: row.answeredAt, status: row.holler.status });
  return {
    id: row.holler.id,
    mode: row.holler.mode,
    title: hollerTitle({
      mode: row.holler.mode,
      title: row.holler.title,
      questions: row.firstPrompt === null ? [] : [{ prompt: row.firstPrompt }],
    }),
    anonymous: row.holler.anonymous,
    senderName: row.senderDisplayName || row.senderName || row.senderSignInName,
    sentAt: iso(row.holler.sentAt),
    closesAt: iso(row.holler.closesAt),
    closedAt: iso(row.holler.closedAt),
    state,
    answeredAt: iso(row.answeredAt),
    slackUrl: state === "waiting" ? slackUrl(row.teamId, row.dmChannelId) : null,
  };
}

export async function listOwnAnswers(ctx: ServiceContext): Promise<OwnHoller[]> {
  const rows = await ownRows(ctx, personOf(ctx));
  return rows.map(present);
}

export async function ownAnswer(ctx: ServiceContext, hollerId: string): Promise<OwnAnswer> {
  const slackUserId = personOf(ctx);
  const [row] = await ownRows(ctx, slackUserId, hollerId);
  if (!row) {
    throw new ServiceError(
      "not_found",
      "This Holler was not sent to you, or it was deleted. Your other answers are on Your answers.",
    );
  }
  const holler = present(row);
  return {
    ...holler,
    description: row.holler.description,
    externalUrl: row.holler.externalUrl,
    given: holler.state === "answered" ? await givenBy(ctx, hollerId, slackUserId) : null,
  };
}

async function ownResponseId(
  ctx: ServiceContext,
  hollerId: string,
  slackUserId: string,
): Promise<string | null> {
  const [row] = await ctx.db
    .select({ id: responses.id })
    .from(responses)
    .leftJoin(responseOwners, eq(responseOwners.responseId, responses.id))
    .where(
      and(
        eq(responses.hollerId, hollerId),
        or(eq(responses.slackUserId, slackUserId), eq(responseOwners.slackUserId, slackUserId)),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

export async function givenBy(
  ctx: ServiceContext,
  hollerId: string,
  slackUserId: string,
): Promise<OwnGiven[] | null> {
  const responseId = await ownResponseId(ctx, hollerId, slackUserId);
  if (!responseId) return null;
  const qs = await ctx.db
    .select()
    .from(questions)
    .where(eq(questions.hollerId, hollerId))
    .orderBy(questions.position);
  if (qs.length === 0) return [];
  const [opts, given, notes] = await Promise.all([
    ctx.db
      .select()
      .from(options)
      .where(
        inArray(
          options.questionId,
          qs.map((q) => q.id),
        ),
      )
      .orderBy(options.position),
    ctx.db.select().from(answers).where(eq(answers.responseId, responseId)),
    ctx.db.select().from(answerNotes).where(eq(answerNotes.responseId, responseId)),
  ]);
  const personQuestions = new Set(qs.filter((q) => q.type === "person").map((q) => q.id));
  const names = await namesOf(
    ctx,
    given.flatMap((a) => (personQuestions.has(a.questionId) && a.text ? [a.text] : [])),
  );
  return qs.map((question) => {
    const own = opts.filter((o) => o.questionId === question.id);
    const mine = given.filter((a) => a.questionId === question.id);
    const noteOf = (kind: "note" | "other") =>
      notes.find((n) => n.questionId === question.id && n.kind === kind)?.text ?? null;
    const picked = new Set(mine.flatMap((a) => (a.optionId ? [a.optionId] : [])));
    const picks =
      question.type === "single" || question.type === "multi"
        ? own
            .filter((o) => picked.has(o.id))
            .map((o) => (o.isOther ? (noteOf("other") ?? "Other") : o.label))
        : mine.flatMap((a) => {
            if (a.text === null) return [];
            return question.type === "person" ? [names.get(a.text) ?? a.text] : [a.text];
          });
    return {
      questionId: question.id,
      prompt: question.prompt,
      type: question.type,
      picks,
      note: noteOf("note"),
    };
  });
}

async function namesOf(ctx: ServiceContext, slackUserIds: readonly string[]) {
  const ids = [...new Set(slackUserIds)];
  const names = new Map<string, string>();
  for (let at = 0; at < ids.length; at += 90) {
    const rows = await ctx.db
      .select({
        slackUserId: slackPeople.slackUserId,
        name: slackPeople.name,
        displayName: slackPeople.displayName,
      })
      .from(slackPeople)
      .where(
        and(
          eq(slackPeople.workspaceId, ctx.workspaceId),
          inArray(slackPeople.slackUserId, ids.slice(at, at + 90)),
        ),
      );
    for (const row of rows) names.set(row.slackUserId, row.displayName || row.name);
  }
  return names;
}
