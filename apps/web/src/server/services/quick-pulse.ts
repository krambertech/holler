import { type HollerDraftInput, hollerDraftSchema } from "@holler/core";
import { eq, sql } from "@holler/core/db";
import { schema } from "../db";
import type { Bindings } from "../env";
import { type ServiceContext, ServiceError } from "./context";
import { sendHoller } from "./delivery";
import { createDraft, sendProblems } from "./hollers";

/**
 * The quick pulse from Slack: /holler, New holler on App Home and the message shortcut. It goes
 * through createDraft and sendHoller like the editor, the API and MCP, so every rule of sending
 * holds here too. docs/slack.md, `/holler`.
 */

/** Every reason this draft cannot be sent, before anything is saved, so the modal can show them. */
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
  | { status: "failed"; hollerId: string; message: string };

/**
 * Saves the pulse and sends it. `viewId` is Slack's id for the modal: it is the create's
 * idempotency key, so a submit Slack delivers twice makes one Holler and sends it once. A send
 * the service refuses, such as the monthly limit, leaves the draft for the sender to finish.
 */
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
    if (!(error instanceof ServiceError)) throw error;
    // The same submit, delivered again after the first one sent it.
    if (error.code !== "conflict") {
      return { status: "failed", hollerId: draft.id, message: error.message };
    }
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
