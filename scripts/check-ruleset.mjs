#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const file = resolve(import.meta.dirname, "../.github/rulesets/main.json");
const REPO = "krambertech/holler";
const exact = new Set(["allowed_merge_methods"]);

const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

export function drift(wanted, live) {
  if (!live) {
    return [`GitHub has no "${wanted.name}" ruleset, so nothing protects main. docs/operations.md`];
  }
  const problems = [];
  if (live.enforcement !== wanted.enforcement) {
    problems.push(`enforcement is ${live.enforcement}, not ${wanted.enforcement}`);
  }
  if (live.target !== wanted.target) problems.push(`it targets ${live.target}`);
  for (const side of ["include", "exclude"]) {
    const refs = live.conditions?.ref_name?.[side] ?? [];
    const own = wanted.conditions.ref_name[side];
    if (!same(refs, own)) {
      problems.push(`it ${side}s ${JSON.stringify(refs)}, not ${JSON.stringify(own)}`);
    }
  }
  if ((live.bypass_actors ?? []).length > wanted.bypass_actors.length) {
    problems.push("someone may bypass the ruleset");
  }
  for (const rule of wanted.rules) {
    const own = live.rules?.find((other) => other.type === rule.type);
    if (!own) {
      problems.push(`the ${rule.type} rule is gone`);
      continue;
    }
    for (const [key, value] of Object.entries(rule.parameters ?? {})) {
      const actual = own.parameters?.[key];
      const kept = exact.has(key)
        ? same(actual ?? [], value)
        : Array.isArray(value)
          ? value.every((item) => JSON.stringify(actual ?? []).includes(named(item)))
          : actual === value;
      if (!kept) problems.push(`${rule.type}: ${key} is ${JSON.stringify(actual)}`);
    }
  }
  return problems;
}

function named(item) {
  return typeof item === "string" ? `"${item}"` : `"context":"${item.context}"`;
}

function api(path) {
  return JSON.parse(execFileSync("gh", ["api", path], { encoding: "utf8" }));
}

function main() {
  const wanted = JSON.parse(readFileSync(file, "utf8"));
  const found = api(`repos/${REPO}/rulesets`).find((ruleset) => ruleset.name === wanted.name);
  const problems = drift(wanted, found ? api(`repos/${REPO}/rulesets/${found.id}`) : null);
  if (problems.length > 0) console.error(problems.map((line) => `main: ${line}`).join("\n"));
  else console.log("check-ruleset: GitHub enforces .github/rulesets/main.json");
  return problems.length > 0 ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
