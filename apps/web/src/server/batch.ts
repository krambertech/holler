import type { BatchItem } from "@holler/core/db";
import type { Db } from "./db";

export async function batchResults(db: Db, statements: BatchItem<"sqlite">[]): Promise<unknown[]> {
  const [first, ...rest] = statements;
  if (!first) return [];
  return db.batch([first, ...rest]);
}

/** D1 runs a batch as one transaction. Drizzle's batch wants a non-empty tuple; this takes a list. */
export async function runBatch(db: Db, statements: BatchItem<"sqlite">[]): Promise<void> {
  const [first, ...rest] = statements;
  if (!first) return;
  await db.batch([first, ...rest]);
}
