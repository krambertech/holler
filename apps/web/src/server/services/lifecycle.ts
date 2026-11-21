import { newId } from "@holler/core";
import { and, eq, lte } from "@holler/core/db";
import { runBatch } from "../batch";
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
  // One Activity row per statement: D1 binds at most 100 values in one, and a busy minute closes many.
  const statements = closed.map((row) =>
    db.insert(schema.activity).values({
      id: newId("activity"),
      workspaceId: row.workspaceId,
      via: "system" as const,
      action: "holler.closed",
      subjectType: "holler",
      subjectId: row.id,
      data: { reason: "close_time" },
      at: now,
    }),
  );
  for (let start = 0; start < statements.length; start += 100) {
    await runBatch(db, statements.slice(start, start + 100));
  }
  return closed.map((row) => row.id);
}
