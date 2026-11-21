import { type HollerDraftInput, hollerDraftSchema } from "@holler/core";
import { eq, sql } from "@holler/core/db";
import { schema } from "../db";
import type { Bindings } from "../env";
import { type ServiceContext, ServiceError } from "./context";
import { sendHoller } from "./delivery";
import { createDraft, sendProblems } from "./hollers";

export function quickPulseProblems(ctx: ServiceContext, input: HollerDraftInput) {
  const draft = hollerDraftSchema.safeParse(input);
  if (!draft.success) {
    return draft.error.issues.map((issue) => ({
      message: issue.message,
      field: issue.path.join("."),
    }));
  }
  return sendProblems(draft.data, ctx.now()).map((p) => ({
    message: p.message,
    field: p.field ?? null,
  }));
}

export type QuickPulseOutcome =
  | { status: "sent"; hollerId: string; prompt: string; recipients: number; closesAt: Date | null }
  | { status: "failed"; hollerId: string | null; message: string };

export async function sendQuickPulse(
  ctx: ServiceContext,
  env: Bindings,
  input: HollerDraftInput,
  viewId: string,
): Promise<QuickPulseOutcome> {
  const draft = await createDraft(ctx, input, { idempotencyKey: `slack-view:${viewId}` });
  try {
    await sendHoller(ctx, env, draft.id);
  } catch (error) {
    if (error instanceof ServiceError && error.code !== "conflict") {
      return { status: "failed", hollerId: draft.id, message: error.message };
    }
    if (!(error instanceof ServiceError)) console.error("quick pulse send failed", error);
  }
  const [row] = await ctx.db
    .select({
      status: schema.hollers.status,
      closesAt: schema.hollers.closesAt,
      recipients: sql<number>`(select count(*) from ${schema.recipients} where ${schema.recipients.hollerId} = ${schema.hollers.id})`,
    })
    .from(schema.hollers)
    .where(eq(schema.hollers.id, draft.id));
  if (row?.status !== "live" && row?.status !== "closed") {
    return {
      status: "failed",
      hollerId: draft.id,
      message: "This pulse did not go out. Open it in Holler to send it.",
    };
  }
  return {
    status: "sent",
    hollerId: draft.id,
    prompt: draft.questions[0]?.prompt ?? draft.displayTitle,
    recipients: Number(row.recipients),
    closesAt: row.closesAt,
  };
}

export const quickPulseUnsavedMessage =
  "Holler could not save this pulse. Try again in a minute, or start it in Holler.";
