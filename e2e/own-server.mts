import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";

const FIRST_CHECKOUT_PORT = 5300;
const CHECKOUT_PORTS = 600;

function output(command: string, args: string[], cwd?: string | undefined) {
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

export function listenerDirectories(port: number | string) {
  const pids = output("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"]) ?? "";
  return pids
    .split("\n")
    .filter(Boolean)
    .map((pid) => output("lsof", ["-a", "-p", pid, "-d", "cwd", "-Fn"]) ?? "")
    .map((fields) =>
      fields
        .split("\n")
        .find((field) => field.startsWith("n"))
        ?.slice(1),
    )
    .filter((dir) => dir !== undefined);
}

function checkoutOf(dir: string) {
  return realpathSync(output("git", ["rev-parse", "--show-toplevel"], dir) ?? dir);
}

export function foreignServerProblem(port: number, checkout: string) {
  const dirs = listenerDirectories(port);
  if (dirs.length === 0) {
    return `Nothing listening on port ${port} can be traced to a checkout, so this run cannot tell whose code it would test. Stop whatever holds the port, or set HOLLER_E2E_PORT to a free port, and run again.`;
  }
  const mine = realpathSync(checkout);
  const foreign = dirs.map(checkoutOf).find((served) => served !== mine);
  if (!foreign) return null;
  return `Port ${port} serves ${foreign}, not this checkout (${mine}), so every test would run against that code. Stop that server, or set HOLLER_E2E_PORT to a free port, and run again.`;
}

function heldByAnotherCheckout(port: number, mine: string) {
  return listenerDirectories(port).some((dir) => checkoutOf(dir) !== mine);
}

export function portForCheckout(checkout: string) {
  const mine = realpathSync(checkout);
  const start = createHash("sha256").update(mine).digest().readUInt32BE(0);
  for (let step = 0; step < CHECKOUT_PORTS; step += 1) {
    const port = FIRST_CHECKOUT_PORT + ((start + step) % CHECKOUT_PORTS);
    if (!heldByAnotherCheckout(port, mine)) return port;
  }
  throw new Error(
    `Other checkouts hold every e2e port from ${FIRST_CHECKOUT_PORT} to ${FIRST_CHECKOUT_PORT + CHECKOUT_PORTS - 1}. Stop the e2e servers you no longer need, or set HOLLER_E2E_PORT to a free port.`,
  );
}
