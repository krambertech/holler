#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(import.meta.dirname, "..");
const HEADING = "Weakened checks";
const suppression =
  /oxlint-disable|eslint-disable|@ts-(expect-error|ignore|nocheck)|check-styling: allow/g;
const testFile = /(\.test\.(ts|tsx|mjs)|\.spec\.ts)$/;
const testCase = /\b(?:it|test)(?:\.each\([\s\S]*?\))?\(/g;
const gateFiles =
  /^(\.github\/(workflows|rulesets)\/|scripts\/(check-|guards)[^/]*(?<!\.test)\.mjs$|playwright\.config\.ts$|apps\/web\/vitest\.config\.ts$|oxlint-plugin-holler\/(?!index\.mjs$|.*\.test\.mjs$)|tsconfig\.base\.json$)/;

const count = (text, pattern) => (text.match(pattern) ?? []).length;

function rulesOf(config) {
  const on = new Map();
  const add = (scope, rules) => {
    for (const [rule, value] of Object.entries(rules ?? {})) {
      const level = Array.isArray(value) ? value[0] : value;
      if (level === "error") on.set(`${rule} in ${scope}`, true);
    }
  };
  add("every file", config.rules);
  for (const override of config.overrides ?? []) add(override.files.join(", "), override.rules);
  return on;
}

function skipped(config, known = null) {
  const overrides = (config.overrides ?? []).filter(
    (override) => !known || Object.keys(override.rules ?? {}).some((rule) => known.has(rule)),
  );
  return [
    ...(config.ignorePatterns ?? []),
    ...overrides.flatMap((override) => override.excludeFiles ?? []),
    ...Object.entries(config.rules ?? {}).flatMap(([rule, v]) => (v === "off" ? [rule] : [])),
  ];
}

function rulesNamed(config) {
  return new Set(
    [config, ...(config.overrides ?? [])].flatMap((at) => Object.keys(at.rules ?? {})),
  );
}

export function weakened(changes) {
  const found = [];
  const say = (file, what) => found.push({ file, what });
  for (const { file, before, after } of changes) {
    if (/^guards\/.*\.json$/.test(file) && before !== null) {
      if (after === null) say(file, "the guard is deleted");
      else {
        const [was, is] = [JSON.parse(before), JSON.parse(after)];
        for (const key of ["check", "fails", "refuses"]) {
          if (was[key] !== is[key]) say(file, `its "${key}" changed`);
        }
      }
    }
    if (testFile.test(file) && before !== null) {
      const lost = count(before, testCase) - count(after ?? "", testCase);
      if (after === null) say(file, "the test file is deleted");
      else if (lost > 0) say(file, `${lost} fewer test case${lost === 1 ? "" : "s"}`);
    }
    if (file === ".oxlintrc.json" && before !== null && after !== null) {
      const [was, is] = [JSON.parse(before), JSON.parse(after)];
      const on = rulesOf(is);
      for (const rule of rulesOf(was).keys()) if (!on.has(rule)) say(file, `${rule} is off`);
      const already = skipped(was);
      for (const entry of skipped(is, rulesNamed(was)))
        if (!already.includes(entry)) say(file, `skips ${entry}`);
    } else if (gateFiles.test(file)) {
      if (before !== null)
        say(file, after === null ? "is deleted" : "decides what passes, and changed");
    }
    if (file === ".claude/settings.json" && before !== null) {
      const kept = after === null ? [] : (JSON.parse(after).permissions?.deny ?? []);
      for (const rule of JSON.parse(before).permissions?.deny ?? []) {
        if (!kept.includes(rule)) say(file, `no longer denies ${rule}`);
      }
    }
    if (/\.(ts|tsx|mjs)$/.test(file) && !/^(oxlint-plugin-holler|scripts)\//.test(file)) {
      const gained = count(after ?? "", suppression) - count(before ?? "", suppression);
      if (gained > 0) say(file, `${gained} more suppression${gained === 1 ? "" : "s"}`);
    }
  }
  return found;
}

export function unnamed(found, body) {
  const section = (body ?? "").split(new RegExp(`^##+ ${HEADING}\\s*$`, "m"))[1] ?? "";
  const own = section.split(/^##+ /m)[0];
  return found.filter(({ file }) => !own.includes(file));
}

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 1 << 28 });
}

function at(ref, file) {
  try {
    return execFileSync("git", ["show", `${ref}:${file}`], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 1 << 28,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

function main([base, head = "HEAD"]) {
  if (!base) {
    console.error("Use: check-weakened.mjs <base> [head], with the description in PR_BODY");
    return 1;
  }
  const files = git(["diff", "--name-only", "--no-renames", "-z", base, head])
    .split("\0")
    .filter(Boolean);
  const found = weakened(
    files.map((file) => ({ file, before: at(base, file), after: at(head, file) })),
  );
  for (const { file, what } of found) console.log(`${file}: ${what}`);
  const missing = unnamed(found, process.env.PR_BODY);
  if (missing.length === 0) {
    console.log(`check-weakened: ${found.length} weakened, all named in the description`);
    return 0;
  }
  const names = [...new Set(missing.map(({ file }) => file))];
  console.error(
    `This pull request changes what its own checks would catch. Add a "## ${HEADING}" section to the description that names each file and why:\n${names.map((name) => `- ${name}: …`).join("\n")}`,
  );
  return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
