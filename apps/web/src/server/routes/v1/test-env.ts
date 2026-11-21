import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getPlatformProxy } from "wrangler";
import { createAuth } from "../../auth";
import { createDb, type Db } from "../../db";
import type { Bindings } from "../../env";

const appDir = fileURLToPath(new URL("../../../../", import.meta.url));

/**
 * A Worker environment for route tests: an in-memory D1 with every migration, a local KV for
 * Better Auth, and test secrets. `app.request(path, init, env)` runs a request through it.
 */
export async function testEnv(): Promise<{
  env: Bindings;
  db: Db;
  auth: ReturnType<typeof createAuth>;
  dispose: () => Promise<void>;
}> {
  const proxy = await getPlatformProxy<{ DB: D1Database; SESSIONS: KVNamespace }>({
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
      .filter((statement) => statement && !/^PRAGMA foreign_keys/i.test(statement));
    for (const statement of statements) await proxy.env.DB.prepare(statement).run();
  }
  const env = {
    ...proxy.env,
    PRODUCT_URL: "http://localhost:5280",
    PUBLIC_SITE_URL: "http://localhost:4321",
    DEV_ROUTES: "true",
    BETTER_AUTH_SECRET: "test-secret-at-least-thirty-two-characters-long",
    SLACK_TOKEN_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  } as unknown as Bindings;
  const db = createDb(proxy.env.DB);
  return { env, db, auth: createAuth(env, db), dispose: () => proxy.dispose() };
}
