#!/usr/bin/env node

// An applied migration never changes. scripts/migration-manifest.json records each migration's
// SHA-256; this fails when a recorded file changed or vanished, and when a new file is not recorded.
// `--write` records new files. It never rewrites a recorded hash: edit the manifest by hand only
// when a migration was provably never applied anywhere, and say so in the pull request.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const dir = resolve(root, "apps/web/migrations");
const manifestPath = resolve(root, "scripts/migration-manifest.json");

export function compare(manifest, files) {
  const problems = [];
  for (const [name, hash] of Object.entries(manifest)) {
    if (!(name in files))
      problems.push(`${name} is recorded but missing: an applied migration is never deleted`);
    else if (files[name] !== hash)
      problems.push(`${name} changed after it was recorded: add a new migration instead`);
  }
  const unrecorded = Object.keys(files).filter((name) => !(name in manifest));
  return { problems, unrecorded };
}

export function missingMigration() {
  const web = resolve(root, "apps/web");
  const copy = mkdtempSync(join(web, ".migrations-check-"));
  try {
    cpSync(dir, copy, { recursive: true });
    const before = readdirSync(copy).length;
    const run = spawnSync(
      "pnpm",
      [
        "exec",
        "drizzle-kit",
        "generate",
        "--dialect=sqlite",
        "--schema=../../packages/core/src/schema/index.ts",
        `--out=./${copy.slice(web.length + 1)}`,
        "--name=unwritten",
      ],
      { cwd: web, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    if (run.status !== 0) {
      return `drizzle-kit could not read the schema, or needs an answer about a rename:\n${run.stdout}${run.stderr}`;
    }
    if (readdirSync(copy).length === before) return null;
    const sql = readdirSync(copy).find((name) => name.endsWith("_unwritten.sql"));
    return `The schema has a change no migration makes: run \`pnpm db:generate\`, then \`node scripts/check-migrations.mjs --write\`\n${readFileSync(join(copy, sql), "utf8")}`;
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = Object.fromEntries(
    readdirSync(dir)
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .map((name) => [
        name,
        createHash("sha256")
          .update(readFileSync(resolve(dir, name)))
          .digest("hex"),
      ]),
  );
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const { problems, unrecorded } = compare(manifest, files);
  if (process.argv.includes("--write")) {
    for (const name of unrecorded) manifest[name] = files[name];
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`check-migrations: recorded ${unrecorded.length} new migration(s)`);
  } else if (unrecorded.length > 0) {
    problems.push(
      ...unrecorded.map(
        (name) => `${name} is not recorded: run \`node scripts/check-migrations.mjs --write\``,
      ),
    );
  }
  const missing = missingMigration();
  if (missing) problems.push(missing);
  if (problems.length > 0) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  if (!process.argv.includes("--write"))
    console.log(`check-migrations: ${Object.keys(files).length} migration(s) unchanged`);
}
