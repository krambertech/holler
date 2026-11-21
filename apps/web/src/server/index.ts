import { app } from "./app";
import { runCronPass } from "./cron";
import { createDb } from "./db";
import type { Bindings } from "./env";

export type { AppEnv } from "./app";

/**
 * The cron runs every minute; `runCronPass` owns what it does. Sending scheduled hollers and
 * reminders arrives with the Slack delivery work.
 */
export default {
  fetch: app.fetch,
  scheduled(controller, env, executionCtx) {
    executionCtx.waitUntil(runCronPass(env, createDb(env.DB), new Date(controller.scheduledTime)));
  },
} satisfies ExportedHandler<Bindings>;
