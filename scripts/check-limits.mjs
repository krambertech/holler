#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GENERATED } from "../oxlint-plugin-holler/comments.mjs";
import { baseCommit, jsonAt } from "./base.mjs";

const root = resolve(import.meta.dirname, "..");
const LIMITS = "oxlint-limits.json";
const steps = { "eslint/max-lines": 50, "eslint/complexity": 5, "eslint/max-depth": 1 };
const numberIn = {
  "eslint/max-lines": /too many lines \((\d+)\)/,
  "eslint/complexity": /complexity of (\d+)/,
  "eslint/max-depth": /too deeply \((\d+)\)/,
};
const named = /\b(?:max-lines|complexity|max-depth)\b/;
const suppressed = new RegExp(`oxlint-disable.*${named.source}`);

const shared = (config) =>
  config.overrides.filter(({ files }) => files.some((name) => name.includes("*")));

export function limitsIn(config) {
  const maxOf = (rules) =>
    Object.fromEntries(
      Object.entries(rules).map(([rule, value]) => [
        rule,
        Array.isArray(value) ? value[1].max : value,
      ]),
    );
  const files = {};
  for (const { files: names, rules } of config.overrides) {
    for (const name of names) if (!name.includes("*")) files[name] = maxOf(rules);
  }
  return { defaults: maxOf(config.rules), files, exempt: JSON.stringify(shared(config)) };
}

export function roundUp(rule, actual) {
  return Math.ceil(actual / steps[rule]) * steps[rule];
}

export function looseLimits({ files }, measured) {
  return Object.entries(files).flatMap(([file, rules]) =>
    Object.entries(rules).flatMap(([rule, limit]) => {
      const actual = measured[file]?.[rule];
      if (actual === undefined)
        return [`${file}: ${rule} is inside the default, so its limit goes`];
      const needed = roundUp(rule, actual);
      return limit > needed
        ? [`${file}: ${rule} is ${actual}, so its limit falls to ${needed}`]
        : [];
    }),
  );
}

export function risenLimits(before, after) {
  const rose = (what, rule, from, to) =>
    to > from || typeof to !== "number"
      ? [`${what}: ${rule} rose from ${from} to ${to}. Split the code instead; a limit only falls`]
      : [];
  return [
    ...(after.exempt === before.exempt
      ? []
      : [`${LIMITS}: which files have no limit never changes`]),
    ...Object.entries(before.defaults).flatMap(([rule, from]) =>
      rose("the default", rule, from, after.defaults[rule]),
    ),
    ...Object.entries(after.files).flatMap(([file, rules]) =>
      Object.entries(rules).flatMap(([rule, to]) =>
        rose(file, rule, before.files[file]?.[rule] ?? before.defaults[rule], to),
      ),
    ),
  ];
}

export function measuredFrom(diagnostics) {
  const measured = {};
  for (const { filename, code, message } of diagnostics) {
    const rule = code.replace(/^eslint\((.*)\)$/, "eslint/$1");
    const actual = Number(numberIn[rule]?.exec(message)?.[1]);
    if (Number.isNaN(actual)) continue;
    measured[filename] ??= {};
    measured[filename][rule] = Math.max(measured[filename][rule] ?? 0, actual);
  }
  return measured;
}

function sources() {
  return execFileSync("git", ["ls-files", "-z", "--", "*.ts", "*.tsx", "*.mjs"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\0")
    .filter((file) => file && !GENERATED.test(file) && existsSync(resolve(root, file)));
}

function measure(config, files) {
  const dir = mkdtempSync(join(tmpdir(), "holler-limits-"));
  const bare = {
    rules: config.rules,
    overrides: shared(config),
    categories: { correctness: "off" },
  };
  try {
    writeFileSync(join(dir, "oxlintrc.json"), JSON.stringify(bare));
    const result = spawnSync(
      resolve(root, "node_modules/.bin/oxlint"),
      ["-c", join(dir, "oxlintrc.json"), "--format", "json", ...files],
      { cwd: root, encoding: "utf8", maxBuffer: 1 << 28 },
    );
    return measuredFrom(JSON.parse(result.stdout).diagnostics);
  } finally {
    rmSync(dir, { recursive: true });
  }
}

function tightened(config, measured) {
  const exact = Object.keys(measured)
    .sort()
    .map((file) => ({
      files: [file],
      rules: Object.fromEntries(
        Object.entries(measured[file])
          .sort()
          .map(([rule, actual]) => [rule, ["error", { max: roundUp(rule, actual) }]]),
      ),
    }));
  return { ...config, overrides: [...shared(config), ...exact] };
}

function main(args) {
  const write = args.includes("--write");
  const path = resolve(root, LIMITS);
  const config = JSON.parse(readFileSync(path, "utf8"));
  const files = sources();
  const measured = measure(config, files);
  const before = jsonAt(baseCommit(args.find((arg) => !arg.startsWith("--"))), LIMITS);
  const wanted = write ? tightened(config, measured) : config;
  const rose = before ? risenLimits(limitsIn(before), limitsIn(wanted)) : [];
  const problems = [
    ...rose,
    ...(write ? [] : looseLimits(limitsIn(config), measured)),
    ...(named.test(readFileSync(resolve(root, ".oxlintrc.json"), "utf8"))
      ? [`.oxlintrc.json: limits live in ${LIMITS}, where they only fall`]
      : []),
    ...files
      .filter((file) => !file.startsWith("scripts/check-limits"))
      .filter((file) => suppressed.test(readFileSync(resolve(root, file), "utf8")))
      .map((file) => `${file}: a limit is never switched off in the file. Split the code instead`),
  ];
  if (problems.length > 0) {
    console.error(problems.join("\n"));
    console.error(`\nAGENTS.md, Architecture. Lower ${LIMITS} with pnpm check:limits --write.`);
    return 1;
  }
  if (write) {
    writeFileSync(path, `${JSON.stringify(wanted, null, 2)}\n`);
    spawnSync(resolve(root, "node_modules/.bin/oxfmt"), [LIMITS], { cwd: root });
  }
  const count = Object.keys(limitsIn(wanted).files).length;
  console.log(`check-limits: ${count} file(s) over the defaults, each held to what it needs`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
