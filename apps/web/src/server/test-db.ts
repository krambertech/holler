import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getPlatformProxy } from "wrangler";
import { createDb, type Db } from "./db";

const appDir = fileURLToPath(new URL("../../", import.meta.url));

/** A fresh in-memory D1 with every migration applied, as the Worker sees it. One per test file. */
export async function testDb(): Promise<{ db: Db; raw: D1Database; dispose: () => Promise<void> }> {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: `${appDir}wrangler.jsonc`,
    envFiles: [],
    persist: false,
    remoteBindings: false,
  });
  const files = readdirSync(`${appDir}migrations`)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const statements = readFileSync(`${appDir}migrations/${file}`, "utf8")
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      // D1 owns PRAGMA foreign_keys and refuses it.
      .filter((statement) => statement && !/^PRAGMA foreign_keys/i.test(statement));
    for (const statement of statements) await proxy.env.DB.prepare(statement).run();
  }
  return { db: createDb(proxy.env.DB), raw: proxy.env.DB, dispose: () => proxy.dispose() };
}
