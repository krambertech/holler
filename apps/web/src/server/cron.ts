import type { Db } from "./db";
import type { Bindings } from "./env";
import { runDirectorySyncs } from "./services/directory-sync";
import { closeDueHollers } from "./services/lifecycle";
import { pruneSlackDeliveries } from "./services/slack-deliveries";

/**
 * One pass of the every-minute cron. Each step claims its rows atomically, so overlapping runs
 * never double up, and only enqueues Slack work; the queue consumer makes the calls.
 * docs/stack.md. `/api/dev/tick` runs the same pass locally at any time.
 */
export async function runCronPass(env: Bindings, db: Db, at: Date): Promise<{ closed: string[] }> {
  const [closed] = await Promise.all([
    closeDueHollers(db, at),
    runDirectorySyncs(env, db, at),
    pruneSlackDeliveries(db, at),
  ]);
  return { closed };
}
