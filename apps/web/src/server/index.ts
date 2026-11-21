import { app } from "./app";
import { createDb } from "./db";
import type { Bindings } from "./env";
import { runDirectorySyncs } from "./services/directory-sync";
import { closeDueHollers } from "./services/lifecycle";
import { pruneSlackDeliveries } from "./services/slack-deliveries";

export type { AppEnv } from "./app";

/**
 * The cron runs every minute. Each pass claims its rows atomically, so overlapping runs never
 * double up, and only enqueues Slack work; the queue consumer makes the calls. docs/stack.md.
 * Sending scheduled hollers and reminders arrives with the Slack delivery work.
 */
export default {
  fetch: app.fetch,
  scheduled(controller, env, executionCtx) {
    const at = new Date(controller.scheduledTime);
    const db = createDb(env.DB);
    executionCtx.waitUntil(closeDueHollers(db, at));
    executionCtx.waitUntil(
      Promise.all([runDirectorySyncs(env, db, at), pruneSlackDeliveries(db, at)]),
    );
  },
} satisfies ExportedHandler<Bindings>;
