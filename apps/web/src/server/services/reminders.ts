import { nextReminder, snoozeTarget } from "@holler/core";
import { and, eq, inArray, isNotNull, isNull, lte, sql } from "@holler/core/db";
import { runBatch } from "../batch";
import { type Db, schema } from "../db";
import type { Bindings } from "../env";
import { activityOf, recordChange } from "./audit";
import type { ServiceContext } from "./context";
import { queueClaimed, toneFor } from "./delivery";

const { hollers, recipients, slackPeople } = schema;

/**
 * The cron's reminder pass. Claims every recipient whose next reminder is due, in one guarded
 * update, so overlapping runs never remind anyone twice, and queues the reminders. The consumer
 * works out the one after. The rhythm is in packages/core/src/reminders.ts.
 */
export async function queueDueReminders(env: Bindings, db: Db, now: Date): Promise<number> {
  const claimed = await db
    .update(recipients)
    .set({
      remindersSent: sql`${recipients.remindersSent} + 1`,
      nextReminderAt: null,
      reminderQueuedAt: now,
    })
    .where(
      and(
        lte(recipients.nextReminderAt, now),
        isNull(recipients.answeredAt),
        isNull(recipients.failure),
        isNotNull(recipients.dmTs),
        inArray(
          recipients.hollerId,
          db
            .select({ id: hollers.id })
            .from(hollers)
            .where(and(eq(hollers.status, "live"), eq(hollers.remindersEnabled, true))),
        ),
      ),
    )
    .returning({
      hollerId: recipients.hollerId,
      slackUserId: recipients.slackUserId,
      remindersSent: recipients.remindersSent,
    });
  await queueClaimed(
    env,
    claimed.map((row) => ({
      kind: "reminder" as const,
      hollerId: row.hollerId,
      slackUserId: row.slackUserId,
      tone: toneFor(row.remindersSent),
      queuedAt: now.toISOString(),
    })),
    async (unqueued) => {
      // Due again now, one reminder fewer, so the next run claims them again.
      const statements = unqueued.flatMap((send) =>
        send.kind === "reminder"
          ? [
              db
                .update(recipients)
                .set({
                  remindersSent: sql`${recipients.remindersSent} - 1`,
                  nextReminderAt: now,
                  reminderQueuedAt: null,
                })
                .where(
                  and(
                    eq(recipients.hollerId, send.hollerId),
                    eq(recipients.slackUserId, send.slackUserId),
                  ),
                ),
            ]
          : [],
      );
      for (let start = 0; start < statements.length; start += 100) {
        await runBatch(db, statements.slice(start, start + 100));
      }
    },
  );
  return claimed.length;
}

/**
 * A recipient's Remind me later: moves only their next reminder, to 15:00 today or 09:00
 * tomorrow in their zone. False when there is nothing to snooze: they answered, or it closed.
 */
export async function snoozeReminder(
  ctx: ServiceContext,
  hollerId: string,
  slackUserId: string,
): Promise<boolean> {
  const where = and(eq(recipients.hollerId, hollerId), eq(recipients.slackUserId, slackUserId));
  const [holler, recipient, person] = await Promise.all([
    ctx.db.query.hollers.findFirst({
      where: and(eq(hollers.id, hollerId), eq(hollers.workspaceId, ctx.workspaceId)),
    }),
    ctx.db.query.recipients.findFirst({ where }),
    ctx.db.query.slackPeople.findFirst({
      where: and(
        eq(slackPeople.workspaceId, ctx.workspaceId),
        eq(slackPeople.slackUserId, slackUserId),
      ),
    }),
  ]);
  if (!holler || !recipient || holler.status !== "live" || recipient.answeredAt) return false;
  const now = ctx.now();
  const timeZone = person?.timeZone ?? null;
  const until = snoozeTarget(now, timeZone);
  const next =
    holler.remindersEnabled && holler.closesAt
      ? nextReminder(
          {
            invitedAt: recipient.invitedAt ?? now,
            remindersSent: recipient.remindersSent,
            snoozedUntil: until,
            closesAt: holler.closesAt,
          },
          timeZone,
          now,
        )
      : null;
  await recordChange(
    ctx,
    // A recipient actor carries no member, so Activity says a snooze happened, not whose.
    activityOf(ctx, { action: "reminder.snoozed", subjectType: "holler", subjectId: hollerId }),
    ctx.db
      .update(recipients)
      .set({ snoozedUntil: until, nextReminderAt: next?.dueAt ?? null })
      .where(where),
  );
  return true;
}
