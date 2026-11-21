import type { Db } from "./db";
import type { Bindings } from "./env";
import { runDirectorySyncs } from "./services/directory-sync";
import { closeDueHollers } from "./services/lifecycle";
import { pruneSlackDeliveries } from "./services/slack-deliveries";

/**
 * One pass of the every-minute cron. Closing hollers uses a status guard, so overlapping runs
 * never close one twice, and pruning is a plain delete. The directory sync calls Slack inline,
 * one workspace at a time, and claims nothing, so two overlapping runs can sync the same
 * workspace. docs/stack.md. `/api/dev/tick` runs the same pass locally at any time.
 */
export async function runCronPass(env: Bindings, db: Db, at: Date): Promise<{ closed: string[] }> {
  const [closed] = await Promise.all([
    closeDueHollers(db, at),
    runDirectorySyncs(env, db, at),
    pruneSlackDeliveries(db, at),
  ]);
  return { closed };
}
