#!/usr/bin/env node

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dir = resolve(import.meta.dirname, "../.github/workflows");
const GATE = "ready";
const afterTheGate = ["deploy"];

export function jobsIn(text) {
  const jobs = {};
  let name = null;
  for (const line of text.slice(text.indexOf("\njobs:")).split("\n")) {
    const heading = line.match(/^ {2}([a-z][a-z0-9-]*):\s*$/);
    if (heading) {
      name = heading[1];
      jobs[name] = [];
    } else if (name) jobs[name].push(line);
  }
  return Object.fromEntries(
    Object.entries(jobs).map(([job, lines]) => {
      const list = lines.map((line) => line.match(/^ {4}needs: \[?([^\]]*)\]?\s*$/)).find(Boolean);
      const needs = list ? list[1].split(",").map((need) => need.trim()) : [];
      return [job, { needs, body: lines.join("\n") }];
    }),
  );
}

export function gateProblems(text) {
  const jobs = jobsIn(text);
  const gate = jobs[GATE];
  if (!gate) return [`ci.yml has no "${GATE}" job, the one check the ruleset requires`];
  const problems = Object.keys(jobs)
    .filter((job) => job !== GATE && !afterTheGate.includes(job) && !gate.needs.includes(job))
    .map(
      (job) => `ci.yml: "${GATE}" does not need "${job}", so it can fail and still merge. Add it`,
    );
  for (const job of afterTheGate) {
    if (jobs[job] && !jobs[job].needs.includes(GATE)) {
      problems.push(`ci.yml: "${job}" does not need "${GATE}", so it can run on a red build`);
    } else if (jobs[job] && !jobs[job].body.includes(`needs.${GATE}.result == 'success'`)) {
      problems.push(
        `ci.yml: "${job}" must ask for needs.${GATE}.result == 'success' by name. Without it GitHub skips "${job}" whenever a job before the gate was skipped, such as the preview on main`,
      );
    }
  }
  return problems;
}

export function workflowProblems(name, text) {
  const problems = [];
  if (!/^permissions:/m.test(text)) {
    problems.push(`${name}: set top-level permissions, such as "contents: read"`);
  }
  if (/^\s+(- )?run:/m.test(text) && !/^defaults:\n {2}run:\n {4}shell: bash$/m.test(text)) {
    problems.push(
      `${name}: set top-level "defaults: run: shell: bash". Without it a step runs with no pipefail, so a failing command before a pipe passes`,
    );
  }
  for (const [at, line] of text.split("\n").entries()) {
    const where = `${name}:${at + 1}`;
    const used = line.match(/uses:\s*([^\s#]+)/)?.[1];
    if (used && !used.startsWith("./") && !/@[0-9a-f]{40}$/.test(used)) {
      problems.push(`${where}: pin ${used} to a commit SHA with its version after "#"`);
    }
    if (/continue-on-error:\s*true/.test(line)) {
      problems.push(`${where}: a step that may fail proves nothing; remove continue-on-error`);
    }
  }
  return problems;
}

function main() {
  const files = readdirSync(dir).filter((name) => name.endsWith(".yml"));
  const problems = files.flatMap((name) =>
    workflowProblems(name, readFileSync(resolve(dir, name), "utf8")),
  );
  problems.push(...gateProblems(readFileSync(resolve(dir, "ci.yml"), "utf8")));
  if (problems.length > 0) console.error(problems.join("\n"));
  else console.log(`check-workflows: every job in ${files.length} workflows can block a merge`);
  return problems.length > 0 ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
