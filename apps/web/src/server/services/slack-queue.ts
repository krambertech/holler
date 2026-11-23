import type { Bindings } from "../env";

const CHUNK = 100;

export function chunks<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let start = 0; start < items.length; start += CHUNK) {
    out.push(items.slice(start, start + CHUNK));
  }
  return out;
}

export async function queueClaimed<Send>(
  env: Bindings,
  sends: Send[],
  release: (unqueued: Send[]) => Promise<unknown>,
  options: { delaySeconds?: number } = {},
): Promise<void> {
  const batches = chunks(sends);
  const delay = options.delaySeconds ? { delaySeconds: options.delaySeconds } : {};
  for (const [index, batch] of batches.entries()) {
    try {
      await env.SLACK_SENDS.sendBatch(batch.map((body) => ({ body, ...delay })));
    } catch (error) {
      await release(batches.slice(index).flat());
      throw error;
    }
  }
}
