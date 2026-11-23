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

function weakenedGuard({ file, before, after }) {
  if (!/^guards\/.*\.json$/.test(file) || before === null) return [];
  if (after === null) return ["the guard is deleted"];
  const [was, is] = [JSON.parse(before), JSON.parse(after)];
  return ["check", "fails", "refuses"]
    .filter((key) => was[key] !== is[key])
    .map((key) => `its "${key}" changed`);
}

function weakenedTest({ file, before, after }) {
  if (!testFile.test(file) || before === null) return [];
  if (after === null) return ["the test file is deleted"];
  const lost = count(before, testCase) - count(after, testCase);
  return lost > 0 ? [`${lost} fewer test case${lost === 1 ? "" : "s"}`] : [];
}

function weakenedLint({ file, before, after }) {
  if (file !== ".oxlintrc.json" || before === null || after === null) return [];
  const [was, is] = [JSON.parse(before), JSON.parse(after)];
  const on = rulesOf(is);
  const already = skipped(was);
  return [
    ...[...rulesOf(was).keys()].filter((rule) => !on.has(rule)).map((rule) => `${rule} is off`),
    ...skipped(is, rulesNamed(was))
      .filter((entry) => !already.includes(entry))
      .map((entry) => `skips ${entry}`),
  ];
}

function weakenedGate({ file, before, after }) {
  if (!gateFiles.test(file) || before === null) return [];
  return [after === null ? "is deleted" : "decides what passes, and changed"];
}

const checking = /^(verify|check|test|typecheck|guards|deploy:check)(:|$)/;
const stepsOf = (script) => script.split("&&").map((step) => step.trim());

function weakenedScripts({ file, before, after }) {
  if (!/(^|\/)package\.json$/.test(file) || before === null) return [];
  const was = JSON.parse(before).scripts ?? {};
  const is = after === null ? {} : (JSON.parse(after).scripts ?? {});
  return Object.entries(was)
    .filter(([name]) => checking.test(name))
    .flatMap(([name, script]) => {
      const kept = stepsOf(is[name] ?? "");
      return stepsOf(script)
        .filter((step) => !kept.includes(step))
        .map((step) => `"${name}" no longer runs ${step}`);
    });
}

function weakenedPermissions({ file, before, after }) {
  if (file !== ".claude/settings.json" || before === null) return [];
  const kept = after === null ? [] : (JSON.parse(after).permissions?.deny ?? []);
  return (JSON.parse(before).permissions?.deny ?? [])
    .filter((rule) => !kept.includes(rule))
    .map((rule) => `no longer denies ${rule}`);
}

function weakenedSource({ file, before, after }) {
  if (!/\.(ts|tsx|mjs)$/.test(file) || /^(oxlint-plugin-holler|scripts)\//.test(file)) return [];
  const gained = count(after ?? "", suppression) - count(before ?? "", suppression);
  return gained > 0 ? [`${gained} more suppression${gained === 1 ? "" : "s"}`] : [];
}

const detectors = [
  weakenedGuard,
  weakenedTest,
  weakenedLint,
  weakenedGate,
  weakenedScripts,
  weakenedPermissions,
  weakenedSource,
];

export function weakened(changes) {
  return changes.flatMap((change) =>
    detectors.flatMap((detect) => detect(change).map((what) => ({ file: change.file, what }))),
  );
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
