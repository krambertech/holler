import { and, eq, lte } from "@holler/core/db";
import { type Db, schema } from "../db";
import { activityOf, recordChange } from "./audit";
import type { ServiceContext } from "./context";

/**
 * Closes every live Holler whose close time has passed. The status guard in the update makes it
 * safe to run twice at once. Returns the closed ids so the caller can notify their creators.
 */
export async function closeDueHollers(db: Db, now: Date): Promise<string[]> {
  const isDue = and(eq(schema.hollers.status, "live"), lte(schema.hollers.closesAt, now));
  const due = await db
    .select({ id: schema.hollers.id, workspaceId: schema.hollers.workspaceId })
    .from(schema.hollers)
    .where(isDue);
  const closed: string[] = [];
  for (const { id, workspaceId } of due) {
    const ctx: ServiceContext = { db, workspaceId, actor: { via: "system" }, now: () => now };
    const rows = await recordChange(
      ctx,
      activityOf(ctx, {
        action: "holler.closed",
        subjectType: "holler",
        subjectId: id,
        data: { reason: "close_time" },
      }),
      db
        .update(schema.hollers)
        .set({ status: "closed", closedAt: now, updatedAt: now })
        .where(and(eq(schema.hollers.id, id), isDue))
        .returning({ id: schema.hollers.id }),
    );
    if (rows.length > 0) closed.push(id);
  }
  return closed;
}
