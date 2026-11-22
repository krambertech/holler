import type { RespondForm, RespondLink, RespondPerson, ResponseInput } from "@holler/core";
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
  if (recipient.answeredAt) return { state: "answered", holler };
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
                // oxlint-disable-next-line holler/bounded-in-array -- a Holler has at most 30 questions
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
