import type { BatchItem } from "@holler/core/db";
import type { Db } from "./db";

export const BOUND_VALUES_PER_LIST = 90;

export function inChunks<T>(list: T[], size = BOUND_VALUES_PER_LIST): T[][] {
  const chunks: T[][] = [];
  for (let at = 0; at < list.length; at += size) chunks.push(list.slice(at, at + size));
  return chunks;
}

export async function readInChunks<T, R>(
  list: readonly T[],
  read: (chunk: T[]) => Promise<R[]>,
): Promise<R[]> {
  const rows: R[] = [];
  for (const chunk of inChunks([...new Set(list)])) {
    for (const row of await read(chunk)) rows.push(row);
  }
  return rows;
}

/** D1 runs a batch as one transaction. Drizzle's batch wants a non-empty tuple; this takes a list. */
export async function runBatch(db: Db, statements: BatchItem<"sqlite">[]): Promise<void> {
  const [first, ...rest] = statements;
  if (!first) return;
  await db.batch([first, ...rest]);
}
