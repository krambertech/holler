import type { BatchItem } from "@holler/core/db";
import type { Db } from "./db";

/** D1 runs a batch as one transaction. Drizzle's batch wants a non-empty tuple; this takes a list. */
export async function runBatch(db: Db, statements: BatchItem<"sqlite">[]): Promise<void> {
  const [first, ...rest] = statements;
  if (!first) return;
  await db.batch([first, ...rest]);
}
