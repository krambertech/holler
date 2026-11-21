import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

// Each Grit rule in biome-plugins/ exists because a bug of its kind shipped once. These cases
// keep the rule catching that kind, and keep it quiet on the code that replaced it.
const root = resolve(import.meta.dirname, "..");

/** Lints `source` as a server file. Biome runs plugins only on files inside their includes. */
function lint(source) {
  const path = `apps/web/src/server/plugin-probe-${randomUUID()}.ts`;
  writeFileSync(resolve(root, path), source);
  try {
    const run = spawnSync("pnpm", ["exec", "biome", "lint", path], { cwd: root, encoding: "utf8" });
    return `${run.stdout}${run.stderr}`;
  } finally {
    rmSync(resolve(root, path));
  }
}

const multiRow = /D1 binds at most 100 values/;

test("refuses a multi-row insert from a list literal or a map", () => {
  assert.match(lint("db.insert(t).values([{ id: 1 }, { id: 2 }]);\n"), multiRow);
  assert.match(lint("db.insert(t).values(rows.map((row) => ({ id: row })));\n"), multiRow);
  assert.match(lint("db.insert(t).values(groups.flatMap((g) => g.rows));\n"), multiRow);
});

test("allows one row per statement", () => {
  assert.doesNotMatch(lint("db.insert(t).values({ id: 1 });\n"), multiRow);
  assert.doesNotMatch(lint("rows.map((row) => db.insert(t).values({ id: row }));\n"), multiRow);
});

test("refuses lower() in server SQL", () => {
  // The probe is source code holding a template literal, so the string is built in two halves.
  const probe = "sql`select * from t where lower(name) = $" + "{q}`;\n";
  assert.match(lint(probe), /folds ASCII only/);
});
