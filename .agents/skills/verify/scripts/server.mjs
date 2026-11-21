#!/usr/bin/env node

// Start the product for a verification run, or stop the one this script started and nothing else.

import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const web = resolve(root, "apps/web");
const record = resolve(web, ".wrangler/verify-server.json");
const logFile = resolve(web, ".wrangler/verify-server.log");

const HELP = `Usage: node .agents/skills/verify/scripts/server.mjs <start|stop>

  start   Write apps/web/.dev.vars from the example if missing, migrate the local D1, start
          the product on 5280 or the next free port, and wait for /api/health. Prints the origin.
  stop    Stop the server start launched, by the process group it recorded.
`;

function freeOn(port, host) {
  return new Promise((done) => {
    const probe = createServer()
      // A machine without IPv6 cannot bind ::1, so nothing else can hold the port there either.
      .once("error", (error) => done(["EADDRNOTAVAIL", "EAFNOSUPPORT"].includes(error.code)))
      .once("listening", () => probe.close(() => done(true)))
      .listen(port, host);
  });
}

// Vite's `localhost` can resolve to ::1 alone, so a port held there is still taken.
async function free(port) {
  return (await freeOn(port, "127.0.0.1")) && (await freeOn(port, "::1"));
}

function devVars() {
  const file = resolve(web, ".dev.vars");
  if (!existsSync(file)) {
    const example = readFileSync(resolve(web, ".dev.vars.example"), "utf8");
    writeFileSync(file, `${example.trimEnd()}\nDEV_ROUTES=true\n`);
    process.stdout.write("Wrote apps/web/.dev.vars from the example, with DEV_ROUTES=true.\n");
    return;
  }
  if (!/^DEV_ROUTES=true$/m.test(readFileSync(file, "utf8"))) {
    throw new Error(
      "apps/web/.dev.vars has no DEV_ROUTES=true line, so /api/dev/* stays off. Add it and start again.",
    );
  }
}

function migrate() {
  const run = () => execFileSync("pnpm", ["db:migrate"], { cwd: root, stdio: "pipe" });
  try {
    run();
  } catch {
    process.stdout.write("Migrations failed against the local D1; rebuilding it.\n");
    rmSync(resolve(web, ".wrangler/state/v3/d1"), { recursive: true, force: true });
    run();
  }
}

async function start() {
  if (existsSync(record)) {
    const { url } = JSON.parse(readFileSync(record, "utf8"));
    process.stdout.write(`Already started: ${url}. Stop it first.\n`);
    return;
  }
  devVars();
  migrate();
  let port = 5280;
  while (!(await free(port))) port += 1;
  const url = `http://localhost:${port}`;
  mkdirSync(dirname(record), { recursive: true });
  const log = openSync(logFile, "w");
  const child = spawn("pnpm", ["exec", "vite", "--port", String(port), "--strictPort"], {
    cwd: web,
    detached: true,
    stdio: ["ignore", log, log],
  });
  let exited = null;
  child.once("exit", (code, signal) => {
    exited = signal ?? `code ${code}`;
  });
  child.unref();
  writeFileSync(record, `${JSON.stringify({ pid: child.pid, url })}\n`);
  const bound = new RegExp(`Local:\\s+\\S+:${port}/`);
  for (let i = 0; i < 120; i += 1) {
    // Until Vite reports binding the port, or once it is gone, whatever answers is someone else's.
    const output = stripVTControlCharacters(readFileSync(logFile, "utf8"));
    if (exited) {
      rmSync(record);
      const tail = output.trim().split("\n").slice(-20).join("\n");
      throw new Error(`The server exited (${exited}) before ${url} was healthy:\n${tail}`);
    }
    if (bound.test(output)) {
      try {
        const health = await fetch(`${url}/api/health`).then((r) => r.json());
        if (health.worker === "holler") {
          process.stdout.write(`${url}\n`);
          return;
        }
      } catch {}
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw new Error(`No answer from ${url}; see apps/web/.wrangler/verify-server.log`);
}

function stop() {
  if (!existsSync(record)) {
    process.stdout.write("Nothing to stop: this script started no server here.\n");
    return;
  }
  const { pid, url } = JSON.parse(readFileSync(record, "utf8"));
  try {
    process.kill(-pid, "SIGTERM");
  } catch {}
  rmSync(record);
  process.stdout.write(`Stopped ${url}.\n`);
}

const command = process.argv[2];
if (command === "start") await start();
else if (command === "stop") stop();
else process.stdout.write(HELP);
