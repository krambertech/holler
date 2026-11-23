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

export function ignoresIn(config) {
  return Object.entries(config.ignoreIssues ?? {}).flatMap(([file, kinds]) =>
    kinds.map((kind) => `${file} (${kind})`),
  );
}

export function otherIgnoresIn(config, where = "") {
  return Object.entries(config).flatMap(([key, value]) => {
    if (key === "ignoreIssues") return [];
    if (key === "workspaces") {
      return Object.entries(value).flatMap(([name, own]) => otherIgnoresIn(own, `${name} `));
    }
    if (!key.startsWith("ignore")) return [];
    return [value].flat().map((entry) => `${where}${key} ${entry}`);
  });
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
    return JSON.parse(result.stdout).issues.flatMap(({ file, ...kinds }) =>
      Object.entries(kinds)
        .filter(([, found]) => Array.isArray(found) && found.length > 0)
        .map(([kind]) => `${file} (${kind})`),
    );
  } finally {
    rmSync(dir, { recursive: true });
  }
}

function main([base]) {
  const config = JSON.parse(readFileSync(resolve(root, CONFIG), "utf8"));
  const before = jsonAt(baseCommit(base), CONFIG);
  const problems = ignoreProblems(
    ignoresIn(config),
    deadWithoutIgnores(config),
    before && ignoresIn(before),
  );
  const kept = before ? otherIgnoresIn(before) : null;
  for (const entry of otherIgnoresIn(config)) {
    if (kept && !kept.includes(entry)) problems.push(`${CONFIG}: "${entry}" is a new ignore`);
  }
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
