import { and, eq, gte, isNotNull, isNull, lte, type SQL } from "@holler/core/db";
import { type Db, schema } from "../db";

const { hollers, recipients, workspaces } = schema;

const MINUTE = 60_000;
export const overdueAfterMinutes = 15;
const catchUpHours = 24;

export type OverdueWork = "send" | "close" | "close_work" | "invite" | "lost_invite" | "reminder";

export async function overdueWork(db: Db, now: Date): Promise<OverdueWork[]> {
  const late = new Date(now.getTime() - overdueAfterMinutes * MINUTE);
  const recent = new Date(now.getTime() - catchUpHours * 60 * MINUTE);
  const live = eq(hollers.status, "live");
  const onHollers: Partial<Record<OverdueWork, SQL | undefined>> = {
    send: and(eq(hollers.status, "scheduled"), lte(hollers.sendAt, late)),
    close: and(live, lte(hollers.closesAt, late)),
    close_work: and(
      eq(hollers.status, "closed"),
      isNull(hollers.closeQueuedAt),
      lte(hollers.closedAt, late),
      gte(hollers.closedAt, recent),
    ),
  };
  const waiting = and(live, isNull(recipients.answeredAt), isNull(recipients.failure));
  const onRecipients: Partial<Record<OverdueWork, SQL | undefined>> = {
    invite: and(waiting, isNull(recipients.invitedAt), lte(recipients.sendAt, late)),
    lost_invite: and(waiting, lte(recipients.invitedAt, late), isNull(recipients.dmTs)),
    reminder: and(
      waiting,
      eq(hollers.remindersEnabled, true),
      isNotNull(recipients.dmTs),
      lte(recipients.nextReminderAt, late),
    ),
  };
  const installed = isNull(workspaces.uninstalledAt);
  const overdue: OverdueWork[] = [];
  for (const [kind, where] of Object.entries(onHollers)) {
    const found = await db
      .select({ id: hollers.id })
      .from(hollers)
      .innerJoin(workspaces, eq(workspaces.id, hollers.workspaceId))
      .where(and(installed, where))
      .limit(1);
    if (found.length > 0) overdue.push(kind as OverdueWork);
  }
  for (const [kind, where] of Object.entries(onRecipients)) {
    const found = await db
      .select({ id: hollers.id })
      .from(recipients)
      .innerJoin(hollers, eq(hollers.id, recipients.hollerId))
      .innerJoin(workspaces, eq(workspaces.id, hollers.workspaceId))
      .where(and(installed, where))
      .limit(1);
    if (found.length > 0) overdue.push(kind as OverdueWork);
  }
  return overdue;
}
