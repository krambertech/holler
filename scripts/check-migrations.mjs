#!/usr/bin/env node

// An applied migration never changes. scripts/migration-manifest.json records each migration's
// SHA-256; this fails when a recorded file changed or vanished, and when a new file is not recorded.
// `--write` records new files. It never rewrites a recorded hash: edit the manifest by hand only
// when a migration was provably never applied anywhere, and say so in the pull request.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
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

export function keptSincePush(pushed, main, files, reset = []) {
  const problems = [];
  for (const [name, hash] of Object.entries(pushed)) {
    if (name in main || reset.includes(name)) continue;
    if (files[name] === hash) continue;
    const what = name in files ? "changed" : "was renamed or deleted";
    problems.push(
      `${name} ${what} after this branch pushed it, and the shared preview database already applied it, so the next preview would fail. Keep it as pushed: when main takes the same number, keep both files (docs/operations.md, Previews). If it must change, ask Kateryna to undo it on holler-preview first, then run again with PREVIEW_RESET=${name}.`,
    );
  }
  return problems;
}

function manifestAt(ref) {
  try {
    const text = execFileSync("git", ["show", `${ref}:scripts/migration-manifest.json`], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return JSON.parse(text);
  } catch {
    return null;
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
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};
  const { problems, unrecorded } = compare(manifest, files);
  const pushed = manifestAt("@{upstream}");
  if (pushed) {
    const reset = (process.env.PREVIEW_RESET ?? "").split(",").filter(Boolean);
    problems.push(...keptSincePush(pushed, manifestAt("origin/main") ?? {}, files, reset));
  }
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
  if (problems.length > 0) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  if (!process.argv.includes("--write"))
    console.log(`check-migrations: ${Object.keys(files).length} migration(s) unchanged`);
}
