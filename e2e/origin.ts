import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const CI_PORT = 5290;
const FIRST_CHECKOUT_PORT = 5300;
const CHECKOUT_PORTS = 600;

export const E2E_CHECKOUT = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

function portOfCheckout(checkout: string) {
  const hash = createHash("sha256").update(checkout).digest().readUInt32BE(0);
  return FIRST_CHECKOUT_PORT + (hash % CHECKOUT_PORTS);
}

function chosenPort() {
  if (process.env.CI) return CI_PORT;
  const asked = process.env.HOLLER_E2E_PORT;
  if (!asked) return portOfCheckout(E2E_CHECKOUT);
  const port = Number(asked);
  if (!Number.isInteger(port) || port < 1024 || port > 65_535) {
    throw new Error(`HOLLER_E2E_PORT is "${asked}": set it to a free port from 1024 to 65535.`);
  }
  return port;
}

export const E2E_PORT = chosenPort();
export const E2E_ORIGIN = `http://localhost:${E2E_PORT}`;
