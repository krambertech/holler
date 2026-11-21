import {
  answerSurface,
  type HollerDraft,
  type HollerDraftInput,
  type HollerOut,
  type HollerSummary,
  type HomeCounts,
  hollerDraftSchema,
  hollerTitle,
  isChoice,
  type Mode,
  newId,
  otherLabel,
  type QuestionStyle,
  type QuestionType,
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
import { type AuditEntry, auditStatement } from "./audit";
import { memberOf, type ServiceContext, ServiceError } from "./context";

const { hollers, questions, options, recipients, members, slackPeople } = schema;

function visibleTo(ctx: ServiceContext, memberId: string) {
  const slackUserId = "slackUserId" in ctx.actor ? ctx.actor.slackUserId : "";
  return and(
    eq(hollers.workspaceId, ctx.workspaceId),
    or(
      eq(hollers.creatorId, memberId),
      and(
        ne(hollers.status, "draft"),
        or(
          eq(hollers.visibility, "workspace"),
          // Spelled out, because Drizzle's relational queries re-alias every column in a sql`` to the outer table.
          sql`exists (select 1 from viewers v where v.holler_id = ${hollers.id} and v.slack_user_id = ${slackUserId})`,
        ),
      ),
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
      firstPrompt: sql<
        string | null
      >`(select ${questions.prompt} from ${questions} where ${questions.hollerId} = ${hollers.id} order by ${questions.position} limit 1)`,
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

  // An anonymous Holler's sender sees how many answered, never who, so its row has no avatars.
  const ids = rows.filter((row) => !row.holler.anonymous).map((row) => row.holler.id);
  const people =
    ids.length === 0 ? new Map<string, HollerSummary["people"]>() : await peopleFor(ctx, ids);

  return rows.map(({ holler, ...row }) => ({
    id: holler.id,
    mode: holler.mode,
    status: holler.status,
    // What the row shows: a pulse without a title shows its first question.
    title: hollerTitle({
      mode: holler.mode,
      title: holler.title,
      questions: row.firstPrompt === null ? [] : [{ prompt: row.firstPrompt }],
    }),
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

type QuestionRow = typeof questions.$inferSelect;
type OptionRow = typeof options.$inferSelect;
type StoredQuestion = QuestionRow & { options: OptionRow[] };
export type QuestionOut = HollerOut["questions"][number];

/**
 * A stored question in the shape the editor and the API send it: the Other option becomes
 * `allowOther`, and the follow-up columns become `followUp`. Sent back with its ids, it saves
 * as it was.
 */
export function presentQuestion(q: StoredQuestion): QuestionOut {
  return {
    id: q.id,
    position: q.position,
    type: q.type,
    style: q.style,
    prompt: q.prompt,
    description: q.description,
    required: q.required,
    options: q.options
      .filter((o) => !o.isOther)
      .map((o) => ({
        id: o.id,
        position: o.position,
        label: o.label,
        score: o.score,
        isOther: o.isOther,
      })),
    allowOther: q.options.some((o) => o.isOther),
    maxChoices: q.maxChoices,
    followUp:
      q.followUpPrompt === null ? null : { prompt: q.followUpPrompt, onlyAfter: q.followUpWhen },
    lowLabel: q.lowLabel,
    highLabel: q.highLabel,
    numberMin: q.numberMin,
    numberMax: q.numberMax,
  };
}

/** A send problem as the editor and the API read it. */
export interface SendProblem {
  message: string;
  field: string | null;
}

/**
 * One Holler with its questions and options, if the member may see it. `questions` holds the
 * stored rows, the Other option included, for Slack delivery and results. The rest is what the
 * editor shows: the title a row displays, where it is answered, and every reason it cannot be
 * sent yet (empty once it is sent).
 */
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
  const stored = qs.map((q) => ({ ...q, options: opts.filter((o) => o.questionId === q.id) }));
  const presented = stored.map(presentQuestion);
  const unsent = holler.status === "draft" || holler.status === "scheduled";
  return {
    ...holler,
    isCreator: holler.creatorId === memberId,
    displayTitle: hollerTitle({ mode: holler.mode, title: holler.title, questions: presented }),
    answeredIn: answerSurface({
      mode: holler.mode,
      description: holler.description,
      questions: presented,
    }).where,
    problems: unsent
      ? sendProblems({ ...holler, questions: presented }, ctx.now()).map((p): SendProblem => ({
          message: p.message,
          field: p.field ?? null,
        }))
      : [],
    questions: stored,
  };
}

export type HollerDetail = Awaited<ReturnType<typeof getHoller>>;

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
    await insertDraft(ctx, memberId, id, draft, now, idempotencyKey, {
      action: "holler.created",
      subjectType: "holler",
      subjectId: id,
    });
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

/** A chase has no questions, so a draft switched to chase saves none. */
const questionsOf = (draft: HollerDraft) => (draft.mode === "chase" ? [] : draft.questions);

/** The title folded for search. A pulse without a title is found by its first question. */
const searchTitleOf = (draft: HollerDraft) =>
  hollerTitle({
    mode: draft.mode,
    title: draft.title,
    questions: questionsOf(draft),
  }).toLocaleLowerCase();

async function insertDraft(
  ctx: ServiceContext,
  memberId: string,
  id: string,
  draft: HollerDraft,
  now: Date,
  idempotencyKey: string | null,
  entry: AuditEntry,
) {
  await ctx.db.batch([
    ctx.db.insert(hollers).values({
      id,
      workspaceId: ctx.workspaceId,
      creatorId: memberId,
      mode: draft.mode,
      status: "draft",
      title: draft.title,
      searchTitle: searchTitleOf(draft),
      description: draft.description,
      externalUrl: draft.externalUrl,
      anonymous: draft.anonymous,
      visibility: draft.visibility,
      tags: [...new Set(draft.tags)],
      audience: draft.audience,
      announceChannelId: draft.announceChannelId,
      sendAt: draft.sendAt,
      sendInRecipientTimeZone: draft.sendInRecipientTimeZone,
      closesAt: draft.closesAt,
      closeAfterHours: draft.closeAfterHours,
      remindersEnabled: draft.remindersEnabled,
      createdVia: ctx.actor.via === "system" ? "web" : ctx.actor.via,
      idempotencyKey,
      createdAt: now,
      updatedAt: now,
    }),
    ...questionStatements(ctx, id, questionsOf(draft), new Map()),
    auditStatement(ctx, entry),
  ]);
}

/**
 * Saves a draft's fields and questions. Only the creator may, and only while it is a draft or
 * scheduled. A question or option sent back with its id is updated in place, so ids stay
 * stable across autosaves and API edits; one without an id is new; one left out is removed.
 * The mode may change until it is sent; switching to chase removes the questions.
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
  await ctx.db.batch([
    ctx.db
      .update(hollers)
      .set({
        mode: draft.mode,
        title: draft.title,
        searchTitle: searchTitleOf(draft),
        description: draft.description,
        externalUrl: draft.externalUrl,
        anonymous: draft.anonymous,
        visibility: draft.visibility,
        tags: [...new Set(draft.tags)],
        audience: draft.audience,
        announceChannelId: draft.announceChannelId,
        sendAt: draft.sendAt,
        sendInRecipientTimeZone: draft.sendInRecipientTimeZone,
        closesAt: draft.closesAt,
        closeAfterHours: draft.closeAfterHours,
        remindersEnabled: draft.remindersEnabled,
        updatedAt: ctx.now(),
      })
      .where(eq(hollers.id, id)),
    ...(await syncQuestions(ctx, id, questionsOf(draft))),
  ]);
  return getHoller(ctx, id);
}

/**
 * Copies a Holler the member can see into a new draft of theirs: the same mode, title,
 * questions, audience and settings, with new ids and no send or close time.
 */
export async function copyHoller(ctx: ServiceContext, id: string) {
  const memberId = memberOf(ctx);
  const source = await getHoller(ctx, id);
  const draft = hollerDraftSchema.parse({
    mode: source.mode,
    title: source.title,
    description: source.description,
    externalUrl: source.externalUrl,
    anonymous: source.anonymous,
    visibility: source.visibility,
    tags: source.tags,
    audience: source.audience,
    announceChannelId: source.announceChannelId,
    sendAt: null,
    sendInRecipientTimeZone: source.sendInRecipientTimeZone,
    closesAt: null,
    closeAfterHours: source.closeAfterHours,
    remindersEnabled: source.remindersEnabled,
    questions: source.questions.map((q) => {
      const { id: _id, position: _position, options: opts, ...rest } = presentQuestion(q);
      return { ...rest, options: opts.map((o) => ({ label: o.label, score: o.score })) };
    }),
  } satisfies HollerDraftInput);
  const copyId = newId("holler");
  await insertDraft(ctx, memberId, copyId, draft, ctx.now(), null, {
    action: "holler.copied",
    subjectType: "holler",
    subjectId: copyId,
    data: { from: source.id },
  });
  return getHoller(ctx, copyId);
}

/** Deletes a draft. Only its creator may, and only before it is scheduled or sent. */
export async function deleteDraft(ctx: ServiceContext, id: string): Promise<void> {
  const memberId = memberOf(ctx);
  const existing = await ctx.db.query.hollers.findFirst({
    where: and(eq(hollers.id, id), eq(hollers.workspaceId, ctx.workspaceId)),
  });
  if (!existing || existing.creatorId !== memberId) {
    throw new ServiceError("not_found", "That Holler does not exist or is not yours to delete.");
  }
  if (existing.status === "scheduled") {
    throw new ServiceError(
      "conflict",
      "This Holler is scheduled to send, so it cannot be deleted. Change its send time instead.",
    );
  }
  if (existing.status !== "draft") {
    throw new ServiceError(
      "conflict",
      "This Holler is already sent, so it stays with its results. Close it to stop the answers.",
    );
  }
  await ctx.db.batch([
    // The status guard keeps a draft that was sent a moment ago.
    ctx.db.delete(hollers).where(and(eq(hollers.id, id), eq(hollers.status, "draft"))),
    auditStatement(ctx, {
      action: "holler.deleted",
      subjectType: "holler",
      subjectId: id,
      data: { mode: existing.mode },
    }),
  ]);
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

const differs = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);

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
      description: question.description,
      required: question.required,
      maxChoices: question.maxChoices,
      followUpPrompt: question.followUp?.prompt ?? null,
      followUpWhen: question.followUp?.onlyAfter ?? null,
      lowLabel: question.lowLabel,
      highLabel: question.highLabel,
      numberMin: question.numberMin,
      numberMax: question.numberMax,
    } satisfies Partial<QuestionRow>;
    if (!existing) {
      statements.push(ctx.db.insert(questions).values({ id: questionId, hollerId, ...fields }));
    } else if (
      (Object.keys(fields) as (keyof typeof fields)[]).some((key) =>
        differs(existing[key], fields[key]),
      )
    ) {
      statements.push(ctx.db.update(questions).set(fields).where(eq(questions.id, questionId)));
    }

    // The Other option is not one the editor sends; it is matched apart, so its id never moves.
    const storedOther = existing?.options.find((o) => o.isOther);
    const storedOptions = new Map(
      (existing?.options ?? []).filter((o) => !o.isOther).map((o) => [o.id, o]),
    );
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

    // Other is always the last option, after every one the sender wrote.
    const other = { position: question.options.length, label: otherLabel, score: null };
    if (question.allowOther && !storedOther) {
      statements.push(
        ctx.db.insert(options).values({ id: newId("option"), questionId, isOther: true, ...other }),
      );
    } else if (question.allowOther && storedOther) {
      if (storedOther.position !== other.position || storedOther.label !== other.label) {
        statements.push(ctx.db.update(options).set(other).where(eq(options.id, storedOther.id)));
      }
    } else if (storedOther) {
      statements.push(ctx.db.delete(options).where(eq(options.id, storedOther.id)));
    }
    return statements;
  });
}

/** What sendProblems reads of a question: the editor's shape, as presentQuestion returns it. */
export interface ProblemQuestion {
  type: QuestionType;
  style: QuestionStyle;
  prompt: string;
  options: readonly { label: string }[];
  allowOther: boolean;
  followUp: { prompt: string; onlyAfter: readonly number[] | null } | null;
  lowLabel: string | null;
  highLabel: string | null;
}

/**
 * Every reason a draft cannot be sent yet, each naming its field, so the editor can show them
 * all at once. Empty when it is ready. A question's field is `questions.<i>.<what>`, and an
 * option's is `questions.<i>.options.<j>`, counting from 0.
 */
export function sendProblems(
  holler: {
    mode: Mode;
    title: string;
    externalUrl: string | null;
    audience: { people: string[]; groups: string[]; everyone: boolean };
    sendAt: Date | null;
    closesAt: Date | null;
    questions: readonly ProblemQuestion[];
  },
  now: Date,
): ServiceError[] {
  const problems: ServiceError[] = [];
  const problem = (message: string, field: string) =>
    problems.push(new ServiceError("invalid", message, field));

  // A pulse needs no title: its first question stands in for one.
  if (holler.mode !== "pulse" && !holler.title.trim()) problem("Give it a title.", "title");
  if (holler.mode === "chase" && !holler.externalUrl) {
    problem("Add the link to the form.", "externalUrl");
  }
  const limits = questionLimits[holler.mode];
  if (holler.questions.length < limits.min) problem("Add a question.", "questions");
  if (holler.questions.length > limits.max) {
    problem(
      holler.mode === "pulse"
        ? "A pulse has one or two questions. Make it a survey to ask more."
        : `A survey has at most ${limits.max} questions.`,
      "questions",
    );
  }
  for (const [i, q] of holler.questions.entries()) {
    questionProblems(q, `questions.${i}`, problem);
  }

  const { people, groups, everyone } = holler.audience;
  if (!everyone && people.length === 0 && groups.length === 0) {
    problem("Choose who to send it to.", "audience");
  }
  if (holler.closesAt) {
    if (holler.closesAt.getTime() <= now.getTime()) {
      problem("That close time has passed. Pick a later one.", "closesAt");
    } else if (holler.sendAt && holler.closesAt.getTime() <= holler.sendAt.getTime()) {
      problem("It would close before it sends. Pick a close time after the send time.", "closesAt");
    }
  }
  return problems;
}

function questionProblems(
  q: ProblemQuestion,
  at: string,
  problem: (message: string, field: string) => void,
) {
  if (!q.prompt.trim()) problem("Write the question.", `${at}.prompt`);
  if (isChoice(q.type)) {
    const seen = new Set<string>();
    if (q.allowOther) seen.add(otherLabel.toLocaleLowerCase());
    for (const [j, option] of q.options.entries()) {
      const label = option.label.trim().toLocaleLowerCase();
      if (!label) {
        problem("Write this option, or remove it.", `${at}.options.${j}`);
      } else if (q.allowOther && label === otherLabel.toLocaleLowerCase()) {
        problem(
          "Other is already the last option. Rename this one or remove it.",
          `${at}.options.${j}`,
        );
      } else if (seen.has(label)) {
        problem(
          "This option says the same as another. Change it or remove it.",
          `${at}.options.${j}`,
        );
      }
      seen.add(label);
    }
  }
  if (q.followUp) {
    if (!q.followUp.prompt.trim()) {
      problem("Write the follow-up question, or turn the follow-up off.", `${at}.followUp`);
    } else if (q.followUp.onlyAfter?.length === 0) {
      problem(
        "Pick the answers that show the follow-up, or show it after any answer.",
        `${at}.followUp`,
      );
    }
  }
  // Words at the ends of a scale come in pairs: both ends, or neither. Two blank ends are no words.
  const low = q.lowLabel?.trim() ?? "";
  const high = q.highLabel?.trim() ?? "";
  if (q.style === "scale" && (low === "") !== (high === "")) {
    if (!low) problem("Add words for the low end too, or clear the high end.", `${at}.lowLabel`);
    if (!high) problem("Add words for the high end too, or clear the low end.", `${at}.highLabel`);
  }
}
