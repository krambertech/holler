import { drizzle } from "@holler/core/db";
import * as schema from "@holler/core/schema";

export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type Db = ReturnType<typeof createDb>;
export { schema };
