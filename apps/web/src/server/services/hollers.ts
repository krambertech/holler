import {
  type HollerDraftInput,
  type HollerSummary,
  type HomeCounts,
  hollerDraftSchema,
  newId,
  questionLimits,
} from "@holler/core";
import {
  and,
  type BatchItem,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  ne,
  or,
  sql,
} from "@holler/core/db";
import { schema } from "../db";
import { auditStatement } from "./audit";
import { memberOf, type ServiceContext, ServiceError } from "./context";

const { hollers, questions, options, recipients, members, slackPeople } = schema;

/** A Holler the member may see: their own, one shared with the workspace, or one shared with them. */
function visibleTo(ctx: ServiceContext, memberId: string) {
  return and(
    eq(hollers.workspaceId, ctx.workspaceId),
    or(
      eq(hollers.creatorId, memberId),
      and(eq(hollers.visibility, "workspace"), ne(hollers.status, "draft")),
      // Spelled out, because Drizzle's relational queries re-alias every column in a sql`` to the outer table.
      sql`exists (select 1 from viewers v where v.holler_id = ${hollers.id} and v.member_id = ${memberId})`,
    ),
  );
}

/** Home's three numbers: live hollers, people still to answer across them, scheduled hollers. */
export async function homeCounts(ctx: ServiceContext): Promise<HomeCounts> {
  const memberId = memberOf(ctx);
  const mine = and(eq(hollers.workspaceId, ctx.workspaceId), eq(hollers.creatorId, memberId));
  const [counts] = await ctx.db
    .select({
      live: sql<number>`sum(case when ${hollers.status} = 'live' then 1 else 0 end)`,
      scheduled: sql<number>`sum(case when ${hollers.status} = 'scheduled' then 1 else 0 end)`,
    })
    .from(hollers)
    .where(mine);
  const [waiting] = await ctx.db
    .select({ count: sql<number>`count(*)` })
    .from(recipients)
    .innerJoin(hollers, eq(hollers.id, recipients.hollerId))
    .where(
      and(
        mine,
        eq(hollers.status, "live"),
        isNull(recipients.answeredAt),
        isNotNull(recipients.invitedAt),
      ),
    );
  return {
    live: Number(counts?.live ?? 0),
    scheduled: Number(counts?.scheduled ?? 0),
    waiting: Number(waiting?.count ?? 0),
  };
}

export interface ListOptions {
  scope: "mine" | "shared";
  status?: "draft" | "scheduled" | "live" | "closed" | undefined;
  mode?: "pulse" | "survey" | "chase" | undefined;
  tag?: string | undefined;
  q?: string | undefined;
}

/** The rows on Home. Mine is what the member created; Shared with me is everything else they can see. */
export async function listHollers(
  ctx: ServiceContext,
  options: ListOptions,
): Promise<HollerSummary[]> {
  const memberId = memberOf(ctx);
  const filters = [
    options.scope === "mine"
      ? and(eq(hollers.workspaceId, ctx.workspaceId), eq(hollers.creatorId, memberId))
      : and(visibleTo(ctx, memberId), ne(hollers.creatorId, memberId)),
  ];
  if (options.status) filters.push(eq(hollers.status, options.status));
  if (options.mode) filters.push(eq(hollers.mode, options.mode));
  if (options.tag) {
    filters.push(
      sql`exists (select 1 from json_each(${hollers.tags}) where json_each.value = ${options.tag.toLocaleLowerCase()})`,
    );
  }
  if (options.q) {
    filters.push(sql`instr(${hollers.searchTitle}, ${options.q.toLocaleLowerCase()}) > 0`);
  }

  const rows = await ctx.db
    .select({
      holler: hollers,
      creatorName: slackPeople.name,
      creatorAvatar: slackPeople.avatarUrl,
      questionCount: sql<number>`(select count(*) from ${questions} where ${questions.hollerId} = ${hollers.id})`,
      recipientCount: sql<number>`(select count(*) from ${recipients} where ${recipients.hollerId} = ${hollers.id})`,
      answeredCount: sql<number>`(select count(*) from ${recipients} where ${recipients.hollerId} = ${hollers.id} and ${recipients.answeredAt} is not null)`,
    })
    .from(hollers)
    .innerJoin(members, eq(members.id, hollers.creatorId))
    .leftJoin(
      slackPeople,
      and(
        eq(slackPeople.workspaceId, members.workspaceId),
        eq(slackPeople.slackUserId, members.slackUserId),
      ),
    )
    .where(and(...filters))
    .orderBy(desc(hollers.updatedAt))
    .limit(200);

  const ids = rows.map((row) => row.holler.id);
  const people =
    ids.length === 0 ? new Map<string, HollerSummary["people"]>() : await peopleFor(ctx, ids);

  return rows.map(({ holler, ...row }) => ({
    id: holler.id,
    mode: holler.mode,
    status: holler.status,
    title: holler.title,
    anonymous: holler.anonymous,
    tags: holler.tags,
    questionCount: Number(row.questionCount),
    recipientCount: Number(row.recipientCount),
    answeredCount: Number(row.answeredCount),
    sendAt: holler.sendAt?.toISOString() ?? null,
    sentAt: holler.sentAt?.toISOString() ?? null,
    closesAt: holler.closesAt?.toISOString() ?? null,
    closedAt: holler.closedAt?.toISOString() ?? null,
    creator: {
      id: holler.creatorId,
      name: row.creatorName ?? "Someone",
      avatarUrl: row.creatorAvatar ?? null,
    },
    people: (people.get(holler.id) ?? []).slice(0, 4),
  }));
}

/** A few recipients per Holler for the avatar stack, answered first. */
async function peopleFor(ctx: ServiceContext, hollerIds: string[]) {
  const rows = await ctx.db
    .select({
      hollerId: recipients.hollerId,
      slackUserId: recipients.slackUserId,
      answeredAt: recipients.answeredAt,
      name: slackPeople.name,
      avatarUrl: slackPeople.avatarUrl,
    })
    .from(recipients)
    .leftJoin(
      slackPeople,
      and(
        eq(slackPeople.workspaceId, ctx.workspaceId),
        eq(slackPeople.slackUserId, recipients.slackUserId),
      ),
    )
    .where(inArray(recipients.hollerId, hollerIds));
  const byHoller = new Map<string, HollerSummary["people"]>();
  for (const row of rows) {
    const list = byHoller.get(row.hollerId) ?? [];
    list.push({
      slackUserId: row.slackUserId,
      name: row.name ?? row.slackUserId,
      avatarUrl: row.avatarUrl ?? null,
      answered: row.answeredAt != null,
    });
    byHoller.set(row.hollerId, list);
  }
  for (const list of byHoller.values())
    list.sort((a, b) => Number(b.answered) - Number(a.answered));
  return byHoller;
}

/** One Holler with its questions and options, if the member may see it. */
export async function getHoller(ctx: ServiceContext, id: string) {
  const memberId = memberOf(ctx);
  const holler = await ctx.db.query.hollers.findFirst({
    where: and(eq(hollers.id, id), visibleTo(ctx, memberId)),
  });
  if (!holler)
    throw new ServiceError("not_found", "That Holler does not exist or is not shared with you.");
  const qs = await ctx.db
    .select()
    .from(questions)
    .where(eq(questions.hollerId, id))
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
  return {
    ...holler,
    isCreator: holler.creatorId === memberId,
    questions: qs.map((q) => ({ ...q, options: opts.filter((o) => o.questionId === q.id) })),
  };
}

/** Creates a draft. Nothing is sent until sendHoller. */
export async function createDraft(ctx: ServiceContext, input: HollerDraftInput) {
  const memberId = memberOf(ctx);
  const draft = hollerDraftSchema.parse(input);
  const id = newId("holler");
  const now = ctx.now();
  await ctx.db.batch([
    ctx.db.insert(hollers).values({
      id,
      workspaceId: ctx.workspaceId,
      creatorId: memberId,
      mode: draft.mode,
      status: "draft",
      title: draft.title,
      searchTitle: draft.title.toLocaleLowerCase(),
      description: draft.description,
      externalUrl: draft.externalUrl,
      anonymous: draft.anonymous,
      visibility: draft.visibility,
      tags: [...new Set(draft.tags)],
      audience: draft.audience,
      announceChannelId: draft.announceChannelId,
      sendAt: draft.sendAt,
      sendInRecipientTimeZone: draft.sendInRecipientTimeZone,
      closeAfterHours: draft.closeAfterHours,
      remindersEnabled: draft.remindersEnabled,
      createdVia: ctx.actor.via === "system" ? "web" : ctx.actor.via,
      createdAt: now,
      updatedAt: now,
    }),
    ...questionStatements(ctx, id, draft.questions),
    auditStatement(ctx, { action: "holler.created", subjectType: "holler", subjectId: id }),
  ]);
  return getHoller(ctx, id);
}

/** Replaces a draft's fields and questions. Only the creator may, and only while it is a draft or scheduled. */
export async function updateDraft(ctx: ServiceContext, id: string, input: HollerDraftInput) {
  const memberId = memberOf(ctx);
  const existing = await ctx.db.query.hollers.findFirst({
    where: and(eq(hollers.id, id), eq(hollers.workspaceId, ctx.workspaceId)),
  });
  if (!existing || existing.creatorId !== memberId) {
    throw new ServiceError("not_found", "That Holler does not exist or is not yours to change.");
  }
  if (existing.status === "live" || existing.status === "closed") {
    throw new ServiceError(
      "conflict",
      "This Holler is already sent, so its questions cannot change.",
    );
  }
  const draft = hollerDraftSchema.parse(input);
  if (draft.mode !== existing.mode) {
    throw new ServiceError("invalid", "A Holler keeps the mode it was made with.", "mode");
  }
  await ctx.db.batch([
    ctx.db
      .update(hollers)
      .set({
        title: draft.title,
        searchTitle: draft.title.toLocaleLowerCase(),
        description: draft.description,
        externalUrl: draft.externalUrl,
        anonymous: draft.anonymous,
        visibility: draft.visibility,
        tags: [...new Set(draft.tags)],
        audience: draft.audience,
        announceChannelId: draft.announceChannelId,
        sendAt: draft.sendAt,
        sendInRecipientTimeZone: draft.sendInRecipientTimeZone,
        closeAfterHours: draft.closeAfterHours,
        remindersEnabled: draft.remindersEnabled,
        updatedAt: ctx.now(),
      })
      .where(eq(hollers.id, id)),
    ctx.db.delete(questions).where(eq(questions.hollerId, id)),
    ...questionStatements(ctx, id, draft.questions),
  ]);
  return getHoller(ctx, id);
}

function questionStatements(
  ctx: ServiceContext,
  hollerId: string,
  input: ReturnType<typeof hollerDraftSchema.parse>["questions"],
) {
  return input.flatMap((question, position) => {
    const questionId = newId("question");
    const statements: BatchItem<"sqlite">[] = [
      ctx.db.insert(questions).values({
        id: questionId,
        hollerId,
        position,
        type: question.type,
        style: question.style,
        prompt: question.prompt,
        required: question.required,
      }),
    ];
    // One option per statement: D1 binds at most 100 values in one query, and a question may have 100 options.
    for (const [index, option] of question.options.entries()) {
      statements.push(
        ctx.db.insert(options).values({
          id: newId("option"),
          questionId,
          position: index,
          label: option.label,
          score: option.score ?? null,
        }),
      );
    }
    return statements;
  });
}

/**
 * Every reason a draft cannot be sent yet, each naming its field, so the editor can show them
 * all at once. Empty when it is ready.
 */
export function sendProblems(holler: {
  mode: "pulse" | "survey" | "chase";
  title: string;
  externalUrl: string | null;
  audience: { people: string[]; groups: string[]; everyone: boolean };
  questions: unknown[];
}): ServiceError[] {
  const problems: ServiceError[] = [];
  if (!holler.title.trim()) problems.push(new ServiceError("invalid", "Give it a title.", "title"));
  const limits = questionLimits[holler.mode];
  if (holler.mode === "chase" && !holler.externalUrl) {
    problems.push(new ServiceError("invalid", "Add the link to the form.", "externalUrl"));
  }
  if (holler.questions.length < limits.min) {
    problems.push(new ServiceError("invalid", "Add a question.", "questions"));
  }
  if (holler.questions.length > limits.max) {
    problems.push(
      new ServiceError(
        "invalid",
        holler.mode === "pulse"
          ? "A pulse has one or two questions. Make it a survey to ask more."
          : `A survey has at most ${limits.max} questions.`,
        "questions",
      ),
    );
  }
  const { people, groups, everyone } = holler.audience;
  if (!everyone && people.length === 0 && groups.length === 0) {
    problems.push(new ServiceError("invalid", "Choose who to send it to.", "audience"));
  }
  return problems;
}
