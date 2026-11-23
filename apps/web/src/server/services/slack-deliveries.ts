import { eq, lt } from "@holler/core/db";
import { type Db, schema } from "../db";

const KEEP_FOR_MS = 24 * 60 * 60 * 1000;

export async function claimSlackDelivery(db: Db, id: string, now: Date): Promise<boolean> {
  const inserted = await db
    .insert(schema.slackDeliveries)
    .values({ id, seenAt: now })
    .onConflictDoNothing()
    .returning({ id: schema.slackDeliveries.id });
  return inserted.length > 0;
}

export async function releaseSlackDelivery(db: Db, id: string): Promise<void> {
  await db.delete(schema.slackDeliveries).where(eq(schema.slackDeliveries.id, id));
}

export async function pruneSlackDeliveries(db: Db, now: Date): Promise<void> {
  await db
    .delete(schema.slackDeliveries)
    .where(lt(schema.slackDeliveries.seenAt, new Date(now.getTime() - KEEP_FOR_MS)));
}
