import { newId } from "@holler/core";
import { and, eq, lte } from "@holler/core/db";
import { type Db, schema } from "../db";

/**
 * Closes every live Holler whose close time has passed. The status guard in the update makes it
 * safe to run twice at once. Returns the closed ids so the caller can notify their creators.
 */
export async function closeDueHollers(db: Db, now: Date): Promise<string[]> {
  const closed = await db
    .update(schema.hollers)
    .set({ status: "closed", closedAt: now, updatedAt: now })
    .where(and(eq(schema.hollers.status, "live"), lte(schema.hollers.closesAt, now)))
    .returning({ id: schema.hollers.id, workspaceId: schema.hollers.workspaceId });
  if (closed.length > 0) {
    await db.insert(schema.activity).values(
      closed.map((row) => ({
        id: newId("activity"),
        workspaceId: row.workspaceId,
        via: "system" as const,
        action: "holler.closed",
        subjectType: "holler",
        subjectId: row.id,
        data: { reason: "close_time" },
        at: now,
      })),
    );
  }
  return closed.map((row) => row.id);
}
