#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { baseCommit, jsonAt } from "./base.mjs";

const root = resolve(import.meta.dirname, "..");
const CONFIG = "knip.json";

export function ignoreProblems(ignored, dead, before) {
  return [
    ...ignored
      .filter((file) => !dead.includes(file))
      .map((file) => `${file} has no dead code now: delete it from "ignoreIssues" in ${CONFIG}`),
    ...ignored
      .filter((file) => before && !before.includes(file))
      .map(
        (file) => `${file}: "ignoreIssues" in ${CONFIG} only gets shorter. Delete the dead code`,
      ),
  ];
}

function knip(args, options = {}) {
  return spawnSync(resolve(root, "node_modules/.bin/knip"), args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1 << 28,
    ...options,
  });
}

function deadWithoutIgnores(config) {
  const dir = mkdtempSync(join(tmpdir(), "holler-knip-"));
  const bare = join(dir, CONFIG);
  try {
    writeFileSync(bare, JSON.stringify({ ...config, ignoreIssues: {} }));
    const result = knip(["-c", bare, "--reporter", "json"]);
    return JSON.parse(result.stdout).issues.map(({ file }) => file);
  } finally {
    rmSync(dir, { recursive: true });
  }
}

function main([base]) {
  const config = JSON.parse(readFileSync(resolve(root, CONFIG), "utf8"));
  const before = jsonAt(baseCommit(base), CONFIG);
  const problems = ignoreProblems(
    Object.keys(config.ignoreIssues),
    deadWithoutIgnores(config),
    before && Object.keys(before.ignoreIssues),
  );
  const found = knip(["--treat-config-hints-as-errors"], { stdio: "inherit" }).status;
  if (found !== 0) problems.push("Delete what nothing uses, or use it. AGENTS.md, Architecture.");
  if (problems.length > 0) {
    console.error(problems.join("\n"));
    return 1;
  }
  console.log("check-dead-code: every file, export and dependency is used");
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
