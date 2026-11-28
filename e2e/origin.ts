import { execFileSync } from "node:child_process";
import { portForCheckout } from "./own-server.mts";

const CI_PORT = 5290;

export const E2E_CHECKOUT = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

function chosenPort() {
  if (process.env.CI) return CI_PORT;
  const asked = process.env.HOLLER_E2E_PORT;
  if (!asked) {
    const port = portForCheckout(E2E_CHECKOUT);
    process.env.HOLLER_E2E_PORT = String(port);
    return port;
  }
  const port = Number(asked);
  if (!Number.isInteger(port) || port < 1024 || port > 65_535) {
    throw new Error(`HOLLER_E2E_PORT is "${asked}": set it to a free port from 1024 to 65535.`);
  }
  return port;
}

export const E2E_PORT = chosenPort();
export const E2E_ORIGIN = `http://localhost:${E2E_PORT}`;
