import type { RecipientsOut } from "@holler/core";
import { and, asc, eq } from "@holler/core/db";
import { schema } from "../db";
import type { ServiceContext } from "./context";
import { manualReminderGapHours } from "./delivery";
import { getHoller } from "./hollers";

const HOUR = 3600_000;

/**
 * Who a Holler went to and who answered, for every door. Holler knows who answered even on an
 * anonymous Holler, because that is how it stops reminding them, but its sender sees only how
 * many: every recipient's `answered` is null and the list stays in name order, so neither the
 * flag nor the order gives anyone away. On a named Holler, answered people come first.
 */
export async function hollerPeople(ctx: ServiceContext, hollerId: string): Promise<RecipientsOut> {
  // getHoller throws not_found unless the member may see it.
  const holler = await getHoller(ctx, hollerId);
  const rows = await ctx.db
    .select({
      slackUserId: schema.recipients.slackUserId,
      answeredAt: schema.recipients.answeredAt,
      invitedAt: schema.recipients.invitedAt,
      dmTs: schema.recipients.dmTs,
      failure: schema.recipients.failure,
      nextReminderAt: schema.recipients.nextReminderAt,
      name: schema.slackPeople.name,
      displayName: schema.slackPeople.displayName,
      avatarUrl: schema.slackPeople.avatarUrl,
    })
    .from(schema.recipients)
    .leftJoin(
      schema.slackPeople,
      and(
        eq(schema.slackPeople.workspaceId, ctx.workspaceId),
        eq(schema.slackPeople.slackUserId, schema.recipients.slackUserId),
      ),
    )
    .where(eq(schema.recipients.hollerId, hollerId))
    .orderBy(asc(schema.slackPeople.searchName));
  const answeredCount = rows.filter((row) => row.answeredAt != null).length;
  const recipients = rows.map((row) => ({
    slackUserId: row.slackUserId,
    name: row.displayName || row.name || row.slackUserId,
    avatarUrl: row.avatarUrl ?? null,
    answered: holler.anonymous ? null : row.answeredAt != null,
    invited: row.invitedAt != null,
    unreachable: row.failure != null,
  }));
  if (!holler.anonymous) recipients.sort((a, b) => Number(b.answered) - Number(a.answered));
  // Who Holler can still remind: waiting, reached, and not refused by Slack. The same rule
  // remindWaiting keeps.
  const remindable = rows.filter(
    (row) => row.answeredAt == null && row.failure == null && row.dmTs != null,
  );
  const live = holler.status === "live";
  const due = remindable.flatMap((row) =>
    row.nextReminderAt ? [row.nextReminderAt.getTime()] : [],
  );
  const nextReminderAt =
    live && holler.remindersEnabled && due.length > 0 ? new Date(Math.min(...due)) : null;
  const reminderAvailableAt =
    live && remindable.length > 0
      ? new Date(
          holler.remindedAt
            ? holler.remindedAt.getTime() + manualReminderGapHours * HOUR
            : ctx.now().getTime(),
        )
      : null;
  return {
    recipientCount: recipients.length,
    answeredCount,
    waitingCount: recipients.length - answeredCount,
    recipients,
    nextReminderAt: nextReminderAt?.toISOString() ?? null,
    reminderAvailableAt: reminderAvailableAt?.toISOString() ?? null,
  };
}
