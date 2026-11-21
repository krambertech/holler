import {
  type HollerDraft,
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

/**
 * Creates a draft. Nothing is sent until sendHoller.
 *
 * With an idempotency key (the API's `Idempotency-Key`), a retry with the same body returns
 * the Holler the first call made, and the same key with a different body is refused, because
 * that is a bug in the caller's script. The column holds the key and a fingerprint of the body.
 */
export async function createDraft(
  ctx: ServiceContext,
  input: HollerDraftInput,
  opts: { idempotencyKey?: string | undefined } = {},
) {
  const memberId = memberOf(ctx);
  const draft = hollerDraftSchema.parse(input);
  let idempotencyKey: string | null = null;
  if (opts.idempotencyKey) {
    const fingerprint = await fingerprintOf(draft);
    idempotencyKey = `${opts.idempotencyKey} ${fingerprint}`;
    const earlier = await earlierCreate(ctx, opts.idempotencyKey);
    if (earlier) return replay(ctx, earlier, idempotencyKey);
  }
  const id = newId("holler");
  const now = ctx.now();
  try {
    await insertDraft(ctx, memberId, id, draft, now, idempotencyKey);
  } catch (error) {
    // Two retries raced; the unique index let one through. Answer as the winner did.
    const earlier = opts.idempotencyKey ? await earlierCreate(ctx, opts.idempotencyKey) : null;
    if (earlier && idempotencyKey) return replay(ctx, earlier, idempotencyKey);
    throw error;
  }
  return getHoller(ctx, id);
}

async function earlierCreate(ctx: ServiceContext, key: string) {
  const rows = await ctx.db
    .select({ id: hollers.id, idempotencyKey: hollers.idempotencyKey })
    .from(hollers)
    .where(
      and(
        eq(hollers.workspaceId, ctx.workspaceId),
        sql`instr(${hollers.idempotencyKey}, ${`${key} `}) = 1`,
      ),
    );
  return rows.find((row) => row.idempotencyKey?.slice(0, key.length + 1) === `${key} `) ?? null;
}

async function replay(
  ctx: ServiceContext,
  earlier: { id: string; idempotencyKey: string | null },
  idempotencyKey: string,
) {
  if (earlier.idempotencyKey !== idempotencyKey) {
    throw new ServiceError(
      "conflict",
      "This Idempotency-Key was already used to create a different Holler. Use a new key for a new Holler.",
      "Idempotency-Key",
    );
  }
  return { ...(await getHoller(ctx, earlier.id)), replayed: true as const };
}

async function fingerprintOf(draft: HollerDraft): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(draft));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function insertDraft(
  ctx: ServiceContext,
  memberId: string,
  id: string,
  draft: HollerDraft,
  now: Date,
  idempotencyKey: string | null,
) {
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
      idempotencyKey,
      createdAt: now,
      updatedAt: now,
    }),
    ...questionStatements(ctx, id, draft.questions, new Map()),
    auditStatement(ctx, { action: "holler.created", subjectType: "holler", subjectId: id }),
  ]);
}

/**
 * Saves a draft's fields and questions. Only the creator may, and only while it is a draft or
 * scheduled. A question or option sent back with its id is updated in place, so ids stay
 * stable across autosaves and API edits; one without an id is new; one left out is removed.
 */
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
    ...(await syncQuestions(ctx, id, draft.questions)),
  ]);
  return getHoller(ctx, id);
}

/** The statements that turn a Holler's stored questions into `input`, touching only what changed. */
async function syncQuestions(
  ctx: ServiceContext,
  hollerId: string,
  input: HollerDraft["questions"],
) {
  const storedQuestions = await ctx.db
    .select()
    .from(questions)
    .where(eq(questions.hollerId, hollerId));
  const storedOptions =
    storedQuestions.length === 0
      ? []
      : await ctx.db
          .select()
          .from(options)
          .where(
            inArray(
              options.questionId,
              storedQuestions.map((q) => q.id),
            ),
          );
  const byId = new Map(
    storedQuestions.map((q) => [
      q.id,
      { ...q, options: storedOptions.filter((o) => o.questionId === q.id) },
    ]),
  );
  const kept = new Set(input.map((q) => q.id).filter((qid) => qid && byId.has(qid)));
  const statements: BatchItem<"sqlite">[] = storedQuestions
    .filter((q) => !kept.has(q.id))
    .map((q) => ctx.db.delete(questions).where(eq(questions.id, q.id)));
  return [...statements, ...questionStatements(ctx, hollerId, input, byId)];
}

type StoredQuestion = typeof questions.$inferSelect & { options: (typeof options.$inferSelect)[] };

function questionStatements(
  ctx: ServiceContext,
  hollerId: string,
  input: HollerDraft["questions"],
  stored: Map<string, StoredQuestion>,
) {
  return input.flatMap((question, position) => {
    const existing = question.id ? stored.get(question.id) : undefined;
    const questionId = existing?.id ?? newId("question");
    const statements: BatchItem<"sqlite">[] = [];
    const fields = {
      position,
      type: question.type,
      style: question.style,
      prompt: question.prompt,
      required: question.required,
    };
    if (!existing) {
      statements.push(ctx.db.insert(questions).values({ id: questionId, hollerId, ...fields }));
    } else if (
      existing.position !== position ||
      existing.type !== question.type ||
      existing.style !== question.style ||
      existing.prompt !== question.prompt ||
      existing.required !== question.required
    ) {
      statements.push(ctx.db.update(questions).set(fields).where(eq(questions.id, questionId)));
    }
    const storedOptions = new Map((existing?.options ?? []).map((o) => [o.id, o]));
    const keptOptions = new Set<string>();
    // One option per statement: D1 binds at most 100 values in one query, and a question may have 100 options.
    for (const [index, option] of question.options.entries()) {
      const before = option.id ? storedOptions.get(option.id) : undefined;
      const values = { position: index, label: option.label, score: option.score ?? null };
      if (!before) {
        statements.push(
          ctx.db.insert(options).values({ id: newId("option"), questionId, ...values }),
        );
        continue;
      }
      keptOptions.add(before.id);
      if (
        before.position !== index ||
        before.label !== option.label ||
        before.score !== values.score
      ) {
        statements.push(ctx.db.update(options).set(values).where(eq(options.id, before.id)));
      }
    }
    for (const option of storedOptions.values()) {
      if (!keptOptions.has(option.id)) {
        statements.push(ctx.db.delete(options).where(eq(options.id, option.id)));
      }
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
