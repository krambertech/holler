import type { Db } from "./db";
import type { Bindings } from "./env";
import {
  queueCloseWork,
  queueDueInvites,
  queueMissingAnnouncements,
  sendDueHollers,
} from "./services/delivery";
import { runDirectorySyncs } from "./services/directory-sync";
import { closeDueHollers } from "./services/lifecycle";
import { queueDueReminders } from "./services/reminders";
import { queueShareNotices } from "./services/sharing";
import { pruneSlackDeliveries } from "./services/slack-deliveries";

/**
 * One pass of the every-minute cron. Every step that sends claims its rows with a guarded update
 * (status, invited_at, next_reminder_at), so overlapping runs never send twice, and only queues
 * Slack work; the SLACK_SENDS consumer makes the calls. The directory sync calls Slack inline,
 * one workspace at a time, and claims nothing, so two overlapping runs can sync the same
 * workspace. docs/stack.md. `/api/dev/tick` runs the same pass locally at any time.
 *
 * Every step runs whatever the others do, so a Slack outage in the directory sync never stops
 * reminders. A step that writes and then queues does both inside itself, so its Slack work is
 * never lost to another step failing. Failures are thrown together once every step has run.
 */
export interface CronPass {
  sent: string[];
  closed: string[];
  invited: number;
  reminded: number;
}

export async function runCronPass(env: Bindings, db: Db, at: Date): Promise<CronPass> {
  const pass = await runSteps({
    // Sending first, so a Holler due now invites in the same pass.
    sent: () => sendDueHollers(env, db, at),
    closed: async () => {
      const ids = await closeDueHollers(db, at);
      // Also picks up any Holler whose close work a failed queue gave back.
      await queueCloseWork(db, env, at);
      return ids;
    },
    invited: () => queueDueInvites(env, db, at),
    reminded: () => queueDueReminders(env, db, at),
    announced: () => queueMissingAnnouncements(env, db, at),
    shared: () => queueShareNotices(env, db, at),
    synced: () => runDirectorySyncs(env, db, at),
    pruned: () => pruneSlackDeliveries(db, at),
  });
  return { sent: pass.sent, closed: pass.closed, invited: pass.invited, reminded: pass.reminded };
}

/**
 * Runs named steps: the first in order, then the rest together. Each step's failure is kept, and
 * once every step has run they are thrown as one AggregateError naming the steps that failed.
 */
export async function runSteps<T extends Record<string, () => Promise<unknown>>>(
  steps: T,
): Promise<{ [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  const [first, ...rest] = Object.entries(steps);
  const results: Record<string, unknown> = {};
  const failures: { name: string; error: unknown }[] = [];
  const run = async ([name, step]: [string, () => Promise<unknown>]) => {
    try {
      results[name] = await step();
    } catch (error) {
      failures.push({ name, error });
    }
  };
  if (first) await run(first);
  await Promise.all(rest.map(run));
  if (failures.length > 0) {
    throw new AggregateError(
      failures.map((failure) => failure.error),
      `Cron steps failed: ${failures.map((failure) => failure.name).join(", ")}`,
    );
  }
  // No failures, so every step stored its result under its own name.
  return results as { [K in keyof T]: Awaited<ReturnType<T[K]>> };
}
