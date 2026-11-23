import { createDb } from "../db";
import type { Bindings } from "../env";
import { deliver, type SlackSend } from "../services/delivery";
import { SlackApiError } from "./client";

export async function consumeSlackSends(batch: MessageBatch<SlackSend>, env: Bindings) {
  const db = createDb(env.DB);
  for (const message of batch.messages) {
    try {
      await deliver(env, db, message.body, new Date());
      message.ack();
    } catch (error) {
      const delaySeconds =
        error instanceof SlackApiError && error.retryAfter
          ? error.retryAfter
          : backoffSeconds(message.attempts);
      console.error("slack send failed", message.body.kind, error);
      message.retry({ delaySeconds });
    }
  }
}

export function backoffSeconds(attempts: number): number {
  return Math.min(10 * 2 ** Math.max(attempts - 1, 0), 600);
}
