import { lt } from "@holler/core/db";
import { type Db, schema } from "../db";

/** Slack retries a delivery for about an hour; a day of ids is plenty to recognise one. */
const KEEP_FOR_MS = 24 * 60 * 60 * 1000;

/**
 * Records that Holler is handling a Slack event or view. Returns false when the id was seen
 * before, so a retry from Slack does the work only once.
 */
export async function claimSlackDelivery(db: Db, id: string, now: Date): Promise<boolean> {
  const inserted = await db
    .insert(schema.slackDeliveries)
    .values({ id, seenAt: now })
    .onConflictDoNothing()
    .returning({ id: schema.slackDeliveries.id });
  return inserted.length > 0;
}

/** The cron's pass: forgets delivery ids older than a day. */
export async function pruneSlackDeliveries(db: Db, now: Date): Promise<void> {
  await db
    .delete(schema.slackDeliveries)
    .where(lt(schema.slackDeliveries.seenAt, new Date(now.getTime() - KEEP_FOR_MS)));
}
