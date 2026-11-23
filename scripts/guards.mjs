#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(import.meta.dirname, "..");
const FOLDER = "guards";

export const layers = ["architecture", "types", "lint", "test", "model", "browser", "ci"];

const fields = {
  required: ["rule", "layer", "past", "check", "fails"],
  proof: ["break", "refuses"],
};

export function occurrences(text, find) {
  return text.split(find).length - 1;
}

export function guardProblems(id, guard, read) {
  const problems = [];
  const say = (message) => problems.push(`${FOLDER}/${id}.json: ${message}`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) say("name the file in kebab-case");
  for (const field of fields.required) {
    if (typeof guard[field] !== "string" || guard[field].trim() === "") {
      say(`needs "${field}", a sentence or command in words`);
    }
  }
  if (guard.layer && !layers.includes(guard.layer)) {
    say(`"layer" is one of ${layers.join(", ")}`);
  }
  for (const key of Object.keys(guard)) {
    if (![...fields.required, ...fields.proof].includes(key)) say(`has an unknown field "${key}"`);
  }
  const proofs = fields.proof.filter((field) => field in guard);
  if (proofs.length !== 1) {
    say(
      'needs one proof that the check can fail: "break", edits that bring the mistake back, or "refuses", a command with a bad input',
    );
  }
  for (const edit of guard.break ?? []) {
    if (edit.write !== undefined) {
      if (read(edit.file) !== null) say(`${edit.file} already exists, so "write" would replace it`);
      continue;
    }
    const text = read(edit.file);
    if (text === null) {
      say(`${edit.file} is gone: point "break" at the code that keeps this rule now`);
      continue;
    }
    const count = occurrences(text, edit.find);
    if (count !== 1) {
      say(
        `its "find" is in ${edit.file} ${count} times and must be there once. The code moved: write the edit that would bring the mistake back today`,
      );
    }
  }
  return problems;
}

export function coverageProblems(guards, { rules, scripts }) {
  const named = JSON.stringify(Object.values(guards));
  return [
    ...rules
      .filter((rule) => !named.includes(`holler(${rule})`))
      .map((rule) => `oxlint-plugin-holler/rules/${rule}.mjs has no guard that proves it fails`),
    ...scripts
      .filter((script) => !namesOf(script).some((name) => named.includes(name)))
      .map((script) => `scripts/${script} has no guard that proves it fails`),
  ];
}

function namesOf(script) {
  return [
    script,
    script.replace(/\.mjs$/, ".test.mjs"),
    script.replace(/^check-/, "pnpm check:").replace(/\.mjs$/, ""),
  ];
}

export function shardOf(ids, shard) {
  if (!shard) return ids;
  const [index, total] = shard.split("/").map(Number);
  return ids.filter((_, at) => at % total === index - 1);
}

export function verdict(guard, { status, output }) {
  if (status === 0) return "the check passed on the broken code";
  if (!output.includes(guard.fails)) {
    return `the check failed without saying "${guard.fails}", so it failed for another reason`;
  }
  return null;
}

export function ranNothing(check, output) {
  return check.includes("vitest run") && !/Tests\s.*\d+ passed/.test(output);
}

export function loadGuards(base = root) {
  const dir = join(base, FOLDER);
  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort();
  return Object.fromEntries(
    files.map((name) => [
      name.slice(0, -".json".length),
      JSON.parse(readFileSync(join(dir, name), "utf8")),
    ]),
  );
}

function readIn(base) {
  return (file) => {
    const path = join(base, file);
    return existsSync(path) ? readFileSync(path, "utf8") : null;
  };
}

function sameEverywhere() {
  const env = { ...process.env, CI: "", FORCE_COLOR: "0", NO_COLOR: "1" };
  delete env.GITHUB_ACTIONS;
  return env;
}

function run(command, cwd) {
  const result = spawnSync("bash", ["-c", command], {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: sameEverywhere(),
  });
  return { status: result.status ?? 1, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

function git(args, cwd = root) {
  return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function copyOfTheTree() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "holler-guards-")));
  git(["worktree", "add", "--quiet", "--detach", "--force", dir, "HEAD"]);
  const changed = [
    git(["diff", "--name-only", "-z", "HEAD"]),
    git(["ls-files", "-z", "--others", "--exclude-standard"]),
  ].flatMap((list) => list.split("\0").filter(Boolean));
  for (const file of changed) {
    const to = join(dir, file);
    rmSync(to, { force: true });
    if (!existsSync(join(root, file))) continue;
    mkdirSync(dirname(to), { recursive: true });
    cpSync(join(root, file), to, { verbatimSymlinks: true });
  }
  const install = run("pnpm install --frozen-lockfile --prefer-offline --silent", dir);
  if (install.status !== 0) throw new Error(`pnpm install failed in ${dir}\n${install.output}`);
  return dir;
}

function breakTree(dir, edits) {
  const before = new Map();
  for (const edit of edits) {
    const path = join(dir, edit.file);
    if (!before.has(path)) before.set(path, existsSync(path) ? readFileSync(path, "utf8") : null);
    mkdirSync(dirname(path), { recursive: true });
    if (edit.write !== undefined) writeFileSync(path, edit.write);
    else {
      const text = readFileSync(path, "utf8");
      const at = text.indexOf(edit.find);
      if (at < 0) throw new Error(`"find" is not in ${edit.file} any more`);
      writeFileSync(path, text.slice(0, at) + edit.replace + text.slice(at + edit.find.length));
    }
  }
  return () => {
    for (const [path, text] of before) {
      if (text === null) rmSync(path, { force: true });
      else writeFileSync(path, text);
    }
  };
}

function prove(guards, ids) {
  const dir = copyOfTheTree();
  const sound = new Map();
  const failures = [];
  try {
    for (const id of ids) {
      const guard = guards[id];
      const started = Date.now();
      if (!sound.has(guard.check)) sound.set(guard.check, run(guard.check, dir));
      const whole = sound.get(guard.check);
      let problem = null;
      let output = "";
      if (whole.status !== 0) {
        problem = "the check fails on the code as it is, so it proves nothing";
        output = whole.output;
      } else if (ranNothing(guard.check, whole.output)) {
        problem = "the check ran no test, so its filter matches nothing";
        output = whole.output;
      } else if (guard.refuses) {
        const result = run(guard.refuses, dir);
        problem = verdict(guard, result);
        output = result.output;
      } else {
        const restore = breakTree(dir, guard.break);
        try {
          const result = run(guard.check, dir);
          problem = verdict(guard, result);
          output = result.output;
        } finally {
          restore();
        }
      }
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`${problem ? "✗" : "✓"} ${id} (${seconds} s)`);
      if (problem) failures.push({ id, problem, output });
    }
  } finally {
    git(["worktree", "remove", "--force", dir]);
  }
  for (const { id, problem, output } of failures) {
    console.error(`\n${FOLDER}/${id}.json: ${problem}\n${output.slice(-3000)}`);
  }
  return failures.length;
}

function ownChecks() {
  return {
    rules: readdirSync(join(root, "oxlint-plugin-holler/rules"))
      .filter((name) => name.endsWith(".mjs") && !name.endsWith(".test.mjs"))
      .map((name) => name.slice(0, -".mjs".length)),
    scripts: readdirSync(join(root, "scripts")).filter((name) =>
      /^check-.*(?<!\.test)\.mjs$/.test(name),
    ),
  };
}

function option(args, name) {
  const at = args.indexOf(name);
  return at < 0 ? null : args[at + 1];
}

function main([command = "list", ...args]) {
  const guards = loadGuards();
  if (command === "list") {
    for (const layer of layers) {
      const own = Object.entries(guards).filter(([, guard]) => guard.layer === layer);
      if (own.length === 0) continue;
      console.log(`\n${layer}`);
      for (const [id, guard] of own) console.log(`  ${id}: ${guard.rule}`);
    }
    return 0;
  }
  if (command === "check") {
    const problems = [
      ...Object.entries(guards).flatMap(([id, guard]) => guardProblems(id, guard, readIn(root))),
      ...coverageProblems(guards, ownChecks()),
    ];
    if (problems.length > 0) console.error(problems.join("\n"));
    else console.log(`guards: ${Object.keys(guards).length} rules, each with a proof it can fail`);
    return problems.length > 0 ? 1 : 0;
  }
  if (command === "prove") {
    const shard = option(args, "--shard");
    const named = args.filter((arg, at) => !arg.startsWith("--") && args[at - 1] !== "--shard");
    const unknown = named.filter((id) => !guards[id]);
    if (unknown.length > 0) {
      console.error(`No such guard: ${unknown.join(", ")}`);
      return 1;
    }
    const inBrowser = args.includes("--browser");
    const all = Object.keys(guards).filter((id) => (guards[id].layer === "browser") === inBrowser);
    return prove(guards, named.length > 0 ? named : shardOf(all, shard)) === 0 ? 0 : 1;
  }
  console.error("Use: guards.mjs list | check | prove [guard…] [--shard 1/4] [--browser]");
  return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
