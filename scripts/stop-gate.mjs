#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MOST_BLOCKS = 2;
const MINUTE = 60_000;

export function decide({ changed, installed, blocks, check }) {
  if (!changed || !installed || blocks >= MOST_BLOCKS) return { block: false };
  const { status, output } = check();
  if (status === 0) return { block: false };
  return {
    block: true,
    message: `pnpm check fails on the changes in this session. Fix the cause, then finish. Never skip, disable or loosen the check to get past it. If it still fails after three rounds, stop and say what fails and why.\n\n${output.slice(-4000)}`,
  };
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    timeout: 1.5 * MINUTE,
    env: { ...process.env, NO_COLOR: "1" },
  });
  return { status: result.status ?? 1, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

function main() {
  const input = JSON.parse(readFileSync(0, "utf8") || "{}");
  const top = run("git", ["rev-parse", "--show-toplevel"], input.cwd ?? process.cwd());
  const root = top.status === 0 ? top.output.trim() : null;
  if (!root || !existsSync(join(root, "guards"))) return 0;
  const dirty = run("git", ["status", "--porcelain"], root).output.trim() !== "";
  const ahead = run("git", ["rev-list", "--count", "origin/main..HEAD"], root).output.trim();
  const dir = join(tmpdir(), "holler-stop-gate");
  const counter = join(dir, String(input.session_id ?? "session").replace(/[^\w-]/g, ""));
  const blocks = existsSync(counter) ? Number(readFileSync(counter, "utf8")) : 0;
  const decision = decide({
    changed: dirty || Number(ahead) > 0,
    installed: existsSync(join(root, "node_modules")),
    blocks,
    check: () => run("pnpm", ["--silent", "check"], root),
  });
  if (!decision.block) return 0;
  mkdirSync(dir, { recursive: true });
  writeFileSync(counter, String(blocks + 1));
  console.error(decision.message);
  return 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
