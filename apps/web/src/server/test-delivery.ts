import type { Db } from "./db";
import type { Bindings } from "./env";
import { deliver, type SlackSend } from "./services/delivery";

/**
 * A Worker env for delivery tests: the real local D1, the dev FakeSlack, and a SLACK_SENDS that
 * keeps what it was given and refuses what Cloudflare would. Tests run the consumer by hand with
 * `drain`, so nothing depends on timing.
 */

/** Cloudflare Queues: at most 100 messages per sendBatch, 128 KB per message, 256 KB per batch. */
export const queueLimits = { batchMessages: 100, messageBytes: 128_000, batchBytes: 256_000 };

const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

export function deliveryEnv(db: Db, raw: D1Database) {
  const queued: SlackSend[] = [];
  /** Kinds of send the queue refuses, so a test can make one step of a pass fail. */
  const refuse = new Set<SlackSend["kind"]>();
  /** How many more batches the queue takes before it refuses the rest, to fail midway. */
  const outage = { batchesLeft: Number.POSITIVE_INFINITY };
  const queue = {
    async sendBatch(messages: Iterable<{ body: SlackSend }>) {
      const batch = [...messages];
      const refused = batch.find((message) => refuse.has(message.body.kind));
      if (refused) throw new Error(`Queue is refusing ${refused.body.kind} sends`);
      if (outage.batchesLeft <= 0) throw new Error("Queue is down");
      outage.batchesLeft -= 1;
      if (batch.length > queueLimits.batchMessages) {
        throw new Error(`Queue refuses a batch of ${batch.length} messages`);
      }
      const total = batch.reduce((sum, message) => sum + bytes(message.body), 0);
      if (total > queueLimits.batchBytes) throw new Error(`Queue refuses a ${total} byte batch`);
      for (const message of batch) {
        if (bytes(message.body) > queueLimits.messageBytes)
          throw new Error("Queue refuses a message");
      }
      queued.push(...batch.map((message) => message.body));
    },
    async send(body: SlackSend) {
      await queue.sendBatch([{ body }]);
    },
  };
  const env = {
    DB: raw,
    DEV_ROUTES: "true",
    PRODUCT_URL: "http://localhost:5280",
    SLACK_SIGNING_SECRET: "test-signing-secret",
    SLACK_TOKEN_KEY: "unused-with-dev-routes",
    BETTER_AUTH_SECRET: "a-test-secret-that-is-long-enough-for-auth",
    SLACK_SENDS: queue,
  } as unknown as Bindings; // The fields delivery reads; the rest of Env is never touched here.

  /** Runs every queued send, and any they queue in turn, as the consumer would at `at`. */
  async function drain(at: Date): Promise<void> {
    for (let send = queued.shift(); send; send = queued.shift()) await deliver(env, db, send, at);
  }

  return { env, queued, refuse, outage, drain };
}

/** Deletes every workspace, and with it every row that hangs off one, so each test starts empty. */
export async function emptyDatabase(raw: D1Database): Promise<void> {
  await raw.batch([
    raw.prepare("delete from workspaces"),
    raw.prepare("delete from slack_deliveries"),
  ]);
}
