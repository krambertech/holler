#!/usr/bin/env node

import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { availableParallelism, homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(import.meta.dirname, "..");
const FOLDER = "formal";
const RECORD = `${FOLDER}/counterexamples.md`;

export const tlc = {
  version: "1.7.4",
  url: "https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar",
  sha256: "936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88",
};

export function literal(value) {
  if (Array.isArray(value)) return `{${value.map(literal).join(", ")}}`;
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return String(value);
  return JSON.stringify(value);
}

export function runsOf(name, model) {
  return Object.entries(model.runs).map(([run, spec]) => {
    const base = spec.like ? model.runs[spec.like] : {};
    const kind = spec.past ? "past" : spec.removed ? "removed" : spec.finding ? "finding" : "holds";
    return {
      id: `${name}/${run}`,
      kind,
      says: spec.says ?? spec.past ?? spec.removed ?? spec.finding,
      spec: model.spec,
      folder: `${FOLDER}/${name}`,
      promises: model.promises,
      invariants: spec.breaks ? [spec.breaks] : Object.keys(model.promises),
      constants: { ...model.constants, ...base.constants, ...spec.constants },
    };
  });
}

export function configOf(run) {
  return [
    "SPECIFICATION Spec",
    "VIEW state",
    `INVARIANTS ${run.invariants.join(" ")}`,
    "CONSTANTS",
    ...Object.entries(run.constants).map(([name, value]) => `  ${name} = ${literal(value)}`),
    "",
  ].join("\n");
}

export function readOutput(output) {
  const broken = /Invariant (\w+) is violated/.exec(output)?.[1] ?? null;
  const holds = output.includes("No error has been found");
  const states = Number(/(\d+) distinct states found, 0 states left/.exec(output)?.[1] ?? 0);
  const steps = [...output.matchAll(/\/\\ said = <<([\s\S]*?)>>/g)].map(([, tuple]) =>
    [...tuple.matchAll(/"([^"]*)"|(\d+)/g)]
      .map(([, text, number]) => text ?? number)
      .filter(Boolean)
      .join(" "),
  );
  return { broken, holds, states, steps };
}

export function problemWith(run, result) {
  const sentence = run.promises[result.broken];
  if (!result.holds && !result.broken) {
    return `TLC did not finish:\n${result.output.split("\n").slice(-25).join("\n")}`;
  }
  if (run.kind === "holds") {
    if (result.holds) return null;
    return `the current design breaks ${result.broken}: ${sentence}`;
  }
  const [named] = run.invariants;
  if (result.broken === named) return null;
  if (run.kind === "finding") {
    return `the finding no longer breaks ${named}. If the code is fixed, delete the run from model.json, turn its misbehaviour on in a run of the current design, and write the old way as a past run. If it is not, the spec lost the bug`;
  }
  return `the model no longer catches it: ${named} holds with the mistake in the spec`;
}

export function section(run, result) {
  const [named] = run.invariants;
  return [
    `## ${run.id}`,
    "",
    run.says,
    "",
    `Breaks ${named}: ${run.promises[named]}`,
    "",
    ...result.steps.map((step, at) => `${at + 1}. ${step}`),
    "",
  ].join("\n");
}

export function recordOf(sections) {
  const part = (kind) => sections.filter((s) => s.kind === kind).map((s) => s.text);
  return [
    "# Counterexamples",
    "",
    "Written by `pnpm check:models --record`. Each is the shortest path the checker finds, one step for each D1 statement or batch, `sendBatch` call or Slack call.",
    "",
    "# What the code does today",
    "",
    "Findings. Each breaks a promise under the misbehaviour it names, and stays here until the code is fixed.",
    "",
    ...part("finding"),
    "# Past bugs the models replay",
    "",
    "Each is the current design with one protection taken out.",
    "",
    ...part("past"),
    "# Protections the models also check",
    "",
    "No past bug, but the promise fails without them.",
    "",
    ...part("removed"),
  ].join("\n");
}

function declaration(source, name) {
  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) return statement;
    if (!ts.isVariableStatement(statement)) continue;
    const found = statement.declarationList.declarations.find(
      (d) => ts.isIdentifier(d.name) && d.name.text === name,
    );
    if (found) return found;
  }
  return null;
}

function tokens(node, source, out) {
  const children = node
    .getChildren(source)
    .filter(
      (child) =>
        child.kind < ts.SyntaxKind.FirstJSDocNode || child.kind > ts.SyntaxKind.LastJSDocNode,
    );
  if (children.length === 0) {
    const text = node.getText(source);
    if (text) out.push(text);
    return out;
  }
  for (const [at, child] of children.entries()) {
    const trailing =
      node.kind === ts.SyntaxKind.SyntaxList &&
      child.kind === ts.SyntaxKind.CommaToken &&
      at === children.length - 1;
    if (!trailing) tokens(child, source, out);
  }
  return out;
}

export function hashOf(text, name) {
  const source = ts.createSourceFile("code.ts", text, ts.ScriptTarget.Latest, true);
  const node = declaration(source, name);
  if (!node) return null;
  return createHash("sha256")
    .update(tokens(node, source, []).join(" "))
    .digest("hex")
    .slice(0, 16);
}

function hashAt(key, read) {
  const [file, name] = key.split("#");
  const text = read(file);
  return text === null ? null : hashOf(text, name);
}

export function syncProblems(name, covers, read) {
  const changed = Object.entries(covers.code).flatMap(([key, hash]) => {
    const now = hashAt(key, read);
    if (now === hash) return [];
    return [now === null ? `  ${key} is gone` : `  ${key} changed`];
  });
  if (changed.length === 0) return [];
  return [
    [
      `${FOLDER}/${name} was confirmed at ${covers.commit}, and the code it describes changed since:`,
      ...changed,
      `Read the change beside ${FOLDER}/${name}, as .agents/skills/verify-delivery-model/SKILL.md says. Change the spec when a step, a guard or their order changed, run pnpm check:models, then pnpm check:models --confirm ${name}.`,
    ].join("\n"),
  ];
}

function readFile(file) {
  const path = join(root, file);
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

function json(file) {
  return JSON.parse(readFileSync(join(root, file), "utf8"));
}

function loadModels() {
  return Object.fromEntries(
    readdirSync(join(root, FOLDER), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map(({ name }) => [
        name,
        {
          model: json(`${FOLDER}/${name}/model.json`),
          covers: json(`${FOLDER}/${name}/covers.json`),
        },
      ]),
  );
}

function confirm(name, covers) {
  const code = Object.fromEntries(
    Object.keys(covers.code)
      .sort()
      .map((key) => [key, hashAt(key, readFile)]),
  );
  const gone = Object.keys(code).filter((key) => code[key] === null);
  if (gone.length > 0) {
    throw new Error(`Take these out of ${FOLDER}/${name}/covers.json first: ${gone.join(", ")}`);
  }
  const files = [...new Set(Object.keys(code).map((key) => key.split("#")[0]))];
  const git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  const commit = git(["log", "-1", "--format=%H", "--", ...files]).slice(0, 12);
  const dirty = git(["status", "--porcelain", "--", ...files]) ? "+changes" : "";
  writeFileSync(
    join(root, `${FOLDER}/${name}/covers.json`),
    `${JSON.stringify({ commit: `${commit}${dirty}`, code }, null, 2)}\n`,
  );
  console.log(`${FOLDER}/${name}: ${Object.keys(code).length} functions confirmed`);
}

function requireJava() {
  const found = spawnSync("java", ["-version"], { encoding: "utf8" });
  if (found.status === 0) return;
  throw new Error(
    "pnpm check:models needs Java 11 or later, and `java -version` does not run. Install one (macOS: brew install --cask temurin@17; Ubuntu: sudo apt install openjdk-17-jre-headless). pnpm check:models:sync needs no Java.",
  );
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function tlcJar() {
  const folder = join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "holler");
  const jar = join(folder, `tla2tools-${tlc.version}.jar`);
  if (existsSync(jar) && sha256(readFileSync(jar)) === tlc.sha256) return jar;
  mkdirSync(folder, { recursive: true });
  const response = await fetch(tlc.url);
  if (!response.ok) throw new Error(`TLC did not download: ${response.status} from ${tlc.url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (sha256(bytes) !== tlc.sha256) {
    throw new Error(
      `${tlc.url} has sha256 ${sha256(bytes)}, not the pinned ${tlc.sha256}. Not run.`,
    );
  }
  const partial = `${jar}.${process.pid}`;
  writeFileSync(partial, bytes);
  renameSync(partial, jar);
  return jar;
}

function runTlc(jar, run) {
  const dir = mkdtempSync(join(tmpdir(), "holler-model-"));
  const spec = readFileSync(join(root, run.folder, run.spec));
  writeFileSync(join(dir, run.spec), spec);
  writeFileSync(join(dir, "run.cfg"), configOf(run));
  const java = ["-XX:+UseParallelGC", "-Xmx2g", `-Djava.io.tmpdir=${dir}`, "-cp", jar];
  const check = ["-deadlock", "-workers", "1", "-metadir", "states", "-config", "run.cfg"];
  const child = spawn("java", [...java, "tlc2.TLC", ...check, run.spec], {
    cwd: dir,
    timeout: 300_000,
  });
  let output = "";
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding("utf8").on("data", (text) => (output += text));
  }
  return new Promise((done, failed) => {
    child.on("error", failed);
    child.on("close", () => {
      rmSync(dir, { recursive: true, force: true });
      done({ output, ...readOutput(output) });
    });
  });
}

async function inParallel(items, limit, work) {
  const results = [];
  const waiting = [...items.entries()];
  const worker = async () => {
    for (let next = waiting.shift(); next; next = waiting.shift()) {
      results[next[0]] = await work(next[1]);
    }
  };
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

async function checkRuns(runs, { record, steps }) {
  requireJava();
  const jar = await tlcJar();
  const recorded = readFile(RECORD) ?? "";
  const limit = Math.min(4, availableParallelism());
  let failures = 0;
  const sections = [];
  await inParallel(runs, limit, async (run) => {
    const result = await runTlc(jar, run);
    let problem = problemWith(run, result);
    if (!problem && run.kind !== "holds") {
      const text = section(run, result);
      sections.push({ id: run.id, kind: run.kind, text });
      if (!record && !recorded.includes(text)) {
        problem = `its counterexample is not the one in ${RECORD}. Read the new one, then pnpm check:models --record`;
      }
    }
    const [named] = run.invariants;
    const outcome = {
      holds: `holds in ${result.states.toLocaleString("en")} states`,
      past: `breaks ${named}, as it did`,
      removed: `breaks ${named} without its protection`,
      finding: `still breaks ${named}, as ${RECORD} says`,
    }[run.kind];
    console.log(problem ? `✗ ${run.id}: ${problem}` : `✓ ${run.id} ${outcome}`);
    if (problem) failures += 1;
    if (result.broken && (problem || steps)) {
      console.log(result.steps.map((step, at) => `    ${at + 1}. ${step}`).join("\n"));
    }
  });
  if (record && failures === 0) {
    const order = new Map(runs.map((run, at) => [run.id, at]));
    sections.sort((a, b) => order.get(a.id) - order.get(b.id));
    writeFileSync(join(root, RECORD), recordOf(sections));
    console.log(`${RECORD}: ${sections.length} counterexamples written`);
  }
  return failures;
}

async function main(args) {
  const flags = new Set(args.filter((arg) => arg.startsWith("--")));
  const named = args.filter((arg) => !arg.startsWith("--"));
  const models = loadModels();
  const all = Object.entries(models).flatMap(([name, { model }]) => runsOf(name, model));
  const ids = [...Object.keys(models), ...all.map((run) => run.id)];
  const unknown = [
    ...named.filter((id) => !ids.includes(id)),
    ...[...flags].filter(
      (flag) => !["--sync", "--confirm", "--record", "--steps", "--config"].includes(flag),
    ),
  ];
  if (unknown.length > 0) {
    console.error(`No such model, run or option: ${unknown.join(", ")}. Runs: ${ids.join(", ")}`);
    return 1;
  }
  const picked = Object.keys(models).filter(
    (name) => named.length === 0 || named.some((id) => id.split("/")[0] === name),
  );
  if (flags.has("--confirm")) {
    for (const name of picked) confirm(name, models[name].covers);
    return 0;
  }
  const runs = all.filter(
    (run) => named.length === 0 || named.includes(run.id) || named.includes(run.id.split("/")[0]),
  );
  if (flags.has("--config")) {
    console.log(runs.map(configOf).join("\n"));
    return 0;
  }
  const stale = picked.flatMap((name) => syncProblems(name, models[name].covers, readFile));
  if (stale.length > 0) console.error(stale.join("\n\n"));
  else console.log(`models: ${picked.join(" and ")} describe the code as it is`);
  if (flags.has("--sync")) return stale.length > 0 ? 1 : 0;
  if (flags.has("--record") && named.length > 0) {
    console.error("--record writes every counterexample, so it takes no names");
    return 1;
  }
  const failures = await checkRuns(runs, {
    record: flags.has("--record"),
    steps: flags.has("--steps"),
  });
  return failures + stale.length > 0 ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
