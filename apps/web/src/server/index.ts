import { app } from "./app";
import { runCronPass } from "./cron";
import { createDb } from "./db";
import type { Bindings } from "./env";
import type { SlackSend } from "./services/delivery";
import { consumeSlackSends } from "./slack/queue";

export type { AppEnv } from "./app";

/**
 * The cron runs every minute; `runCronPass` owns what it does. The queue consumer makes every
 * Slack call the cron and the services put on SLACK_SENDS.
 */
export default {
  fetch: app.fetch,
  scheduled(controller, env, executionCtx) {
    executionCtx.waitUntil(runCronPass(env, createDb(env.DB), new Date(controller.scheduledTime)));
  },
  queue: consumeSlackSends,
} satisfies ExportedHandler<Bindings, SlackSend>;
