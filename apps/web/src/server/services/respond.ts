import type {
  RespondGiven,
  RespondForm,
  RespondLink,
  RespondPerson,
  ResponseInput,
} from "@holler/core";
import { and, eq, inArray } from "@holler/core/db";
import { type Db, schema } from "../db";
import type { Bindings } from "../env";
import { type ServiceContext, ServiceError } from "./context";
import { loadSlackHoller, queueAfterResponse } from "./delivery";
import { searchDirectory } from "./directory";
import { checkRespondLink } from "./respond-links";
import { recordResponse } from "./responses";

const badLink = () =>
  new ServiceError(
    "forbidden",
    "This link does not open this Holler. Open it again from your message in Slack.",
  );

export async function recipientFromLink(
  base: { db: Db; now: () => Date },
  env: Pick<Bindings, "BETTER_AUTH_SECRET" | "PRODUCT_URL">,
  hollerId: string,
  link: RespondLink,
): Promise<ServiceContext> {
  if (!(await checkRespondLink(env, hollerId, link.u, link.s))) throw badLink();
  const holler = await base.db.query.hollers.findFirst({
    where: eq(schema.hollers.id, hollerId),
    columns: { workspaceId: true },
  });
  if (!holler) throw new ServiceError("not_found", "This Holler was deleted.");
  return {
    db: base.db,
    now: base.now,
    workspaceId: holler.workspaceId,
    actor: { via: "web", recipientSlackUserId: link.u },
  };
}

function recipientOf(ctx: ServiceContext): string {
  if (!("recipientSlackUserId" in ctx.actor)) throw badLink();
  return ctx.actor.recipientSlackUserId;
}

export async function respondFormFor(ctx: ServiceContext, hollerId: string): Promise<RespondForm> {
  const slackUserId = recipientOf(ctx);
  const loaded = await loadSlackHoller(ctx.db, hollerId);
  if (!loaded || loaded.row.workspaceId !== ctx.workspaceId) {
    throw new ServiceError("not_found", "This Holler was deleted.");
  }
  const recipient = await ctx.db.query.recipients.findFirst({
    where: and(
      eq(schema.recipients.hollerId, hollerId),
      eq(schema.recipients.slackUserId, slackUserId),
    ),
  });
  if (!recipient) throw new ServiceError("forbidden", "This Holler was not sent to you.");
  const { row, holler: h, creatorSlackUserId } = loaded;
  const sender = await ctx.db.query.slackPeople.findFirst({
    where: and(
      eq(schema.slackPeople.workspaceId, row.workspaceId),
      eq(schema.slackPeople.slackUserId, creatorSlackUserId),
    ),
  });
  const holler = {
    id: h.id,
    mode: h.mode,
    title: h.title,
    description: h.description,
    senderName: h.senderName,
    senderSlackUserId: creatorSlackUserId,
    senderAvatarUrl: sender?.avatarUrl ?? null,
    anonymous: h.anonymous,
    closesAt: (row.closedAt ?? row.closesAt)?.toISOString() ?? null,
    externalUrl: h.externalUrl,
  };
  if (recipient.answeredAt) {
    const given = h.anonymous ? null : await givenBy(ctx, hollerId, slackUserId);
    return { state: "answered", holler, given };
  }
  if (row.status !== "live") return { state: "closed", holler };

  const others =
    h.questions.length === 0
      ? []
      : await ctx.db
          .select({
            id: schema.options.id,
            questionId: schema.options.questionId,
            position: schema.options.position,
          })
          .from(schema.options)
          .where(
            and(
              inArray(
                schema.options.questionId,
                h.questions.map((q) => q.id),
              ),
              eq(schema.options.isOther, true),
            ),
          );
  const questions = h.questions.map((q) => {
    const other = others.find((o) => o.questionId === q.id);
    return {
      id: q.id,
      type: q.type,
      style: q.style,
      prompt: q.prompt,
      description: q.description,
      required: q.required,
      options: [
        ...q.options.map((o) => ({
          id: o.id,
          position: o.position,
          label: o.label,
          isOther: false,
        })),
        ...(other
          ? [{ id: other.id, position: other.position, label: "Other", isOther: true }]
          : []),
      ],
      maxChoices: q.maxChoices,
      followUp: q.followUp,
      lowLabel: q.lowLabel,
      highLabel: q.highLabel,
      numberMin: q.numberMin,
      numberMax: q.numberMax,
    };
  });
  return { state: "open", holler, questions };
}

async function givenBy(
  ctx: ServiceContext,
  hollerId: string,
  slackUserId: string,
): Promise<RespondGiven[] | null> {
  const response = await ctx.db.query.responses.findFirst({
    where: and(
      eq(schema.responses.hollerId, hollerId),
      eq(schema.responses.slackUserId, slackUserId),
    ),
  });
  if (!response) return null;
  const [qs, rows, notes] = await Promise.all([
    ctx.db
      .select()
      .from(schema.questions)
      .where(eq(schema.questions.hollerId, hollerId))
      .orderBy(schema.questions.position),
    ctx.db.select().from(schema.answers).where(eq(schema.answers.responseId, response.id)),
    ctx.db.select().from(schema.answerNotes).where(eq(schema.answerNotes.responseId, response.id)),
  ]);
  const opts =
    qs.length === 0
      ? []
      : await ctx.db
          .select()
          .from(schema.options)
          .where(
            inArray(
              schema.options.questionId,
              qs.map((q) => q.id),
            ),
          )
          .orderBy(schema.options.position);
  const pickedPeople = rows.filter((a) => qs.find((q) => q.id === a.questionId)?.type === "person");
  const people =
    pickedPeople.length === 0
      ? []
      : await ctx.db
          .select()
          .from(schema.slackPeople)
          .where(
            and(
              eq(schema.slackPeople.workspaceId, ctx.workspaceId),
              inArray(
                schema.slackPeople.slackUserId,
                pickedPeople.map((a) => a.text ?? ""),
              ),
            ),
          );
  return qs.map((q) => {
    const own = rows.filter((a) => a.questionId === q.id);
    const noteOf = (kind: "note" | "other") =>
      notes.find((n) => n.questionId === q.id && n.kind === kind)?.text ?? null;
    let picks: string[];
    if (q.type === "person") {
      picks = own.map((a) => {
        const p = people.find((person) => person.slackUserId === a.text);
        return p?.name || p?.displayName || a.text || "";
      });
    } else if (q.type === "text" || q.type === "number") {
      picks = own.map((a) => a.text ?? "");
    } else {
      const listed = opts.filter((o) => o.questionId === q.id && !o.isOther);
      const endWord = (optionId: string) => {
        if (q.style !== "scale") return null;
        if (optionId === listed[0]?.id) return q.lowLabel;
        if (optionId === listed[listed.length - 1]?.id) return q.highLabel;
        return null;
      };
      picks = opts
        .filter((o) => o.questionId === q.id && own.some((a) => a.optionId === o.id))
        .map((o) => {
          if (o.isOther) return noteOf("other") ?? "Other";
          const word = endWord(o.id);
          return word ? `${o.label}, ${word}` : o.label;
        });
    }
    return { questionId: q.id, prompt: q.prompt, picks, note: noteOf("note") };
  });
}

export async function answerOnWeb(
  ctx: ServiceContext,
  env: Bindings,
  hollerId: string,
  response: ResponseInput,
): Promise<RespondForm> {
  const slackUserId = recipientOf(ctx);
  try {
    await recordResponse(ctx, { hollerId, slackUserId, via: "web", response });
  } catch (error) {
    if (!(error instanceof ServiceError)) throw error;
    if (error.code === "closed") return respondFormFor(ctx, hollerId);
    if (error.code !== "conflict") throw error;
  }
  await queueAfterResponse(env, hollerId, slackUserId);
  return respondFormFor(ctx, hollerId);
}

export async function respondPeople(
  ctx: ServiceContext,
  hollerId: string,
  query: string,
): Promise<RespondPerson[]> {
  const form = await respondFormFor(ctx, hollerId);
  if (form.state !== "open" || !form.questions.some((q) => q.type === "person")) {
    throw new ServiceError("forbidden", "This Holler does not ask you to pick anyone.");
  }
  const { people } = await searchDirectory(ctx, query, 20);
  return people.map((p) => ({
    slackUserId: p.slackUserId,
    name: p.name || p.displayName || p.slackUserId,
    avatarUrl: p.avatarUrl,
  }));
}
