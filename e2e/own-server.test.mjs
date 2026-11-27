import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { pathToFileURL } from "node:url";
import { foreignServerProblem, portForCheckout } from "./own-server.mts";

const checkout = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  cwd: import.meta.dirname,
  encoding: "utf8",
}).trim();

const stops = [];
after(() => stops.forEach((stop) => stop()));

const LISTEN =
  "const s = require('node:http').createServer().listen(Number(process.argv[1]), '127.0.0.1', () => console.log(s.address().port));";

function listenFrom(cwd, port = 0) {
  const child = spawn(process.execPath, ["-e", LISTEN, String(port)], {
    cwd,
    stdio: ["ignore", "pipe", "inherit"],
  });
  stops.push(() => child.kill());
  return new Promise((resolve) =>
    child.stdout.once("data", (data) => resolve(Number(String(data)))),
  );
}

function otherCheckout() {
  const dir = mkdtempSync(join(tmpdir(), "holler-other-checkout-"));
  execFileSync("git", ["init", "--quiet"], { cwd: dir });
  stops.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function freePort() {
  return new Promise((resolve) => {
    const server = createServer().listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

test("refuses a server another checkout runs", async () => {
  const port = await listenFrom(otherCheckout());
  assert.match(
    foreignServerProblem(port, checkout) ?? "",
    /holler-other-checkout-.*not this checkout/,
  );
});

test("accepts a server this checkout runs from a subfolder", async () => {
  const port = await listenFrom(join(checkout, "apps/web"));
  assert.equal(foreignServerProblem(port, checkout), null);
});

test("refuses a port it cannot trace to any checkout", async () => {
  assert.match(foreignServerProblem(await freePort(), checkout) ?? "", /cannot tell whose code/);
});

test("skips a port another checkout holds", async () => {
  const mine = otherCheckout();
  const first = portForCheckout(mine);
  await listenFrom(otherCheckout(), first);
  assert.notEqual(portForCheckout(mine), first);
});

test("keeps the port its own server holds", async () => {
  const mine = otherCheckout();
  const first = portForCheckout(mine);
  await listenFrom(mine, first);
  assert.equal(portForCheckout(mine), first);
});

const PARENT = `
const { execFileSync } = await import("node:child_process");
const { E2E_PORT } = await import(process.argv[1]);
console.log(E2E_PORT);
process.stdin.once("data", () => {
  const child = execFileSync(process.execPath, ["--input-type=module", "-e", \`console.log((await import(process.argv[1])).E2E_PORT)\`, process.argv[1]], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  console.log(child.trim());
  process.exit(0);
});
`;

test("a child process keeps the port its parent chose", async () => {
  const origin = pathToFileURL(join(import.meta.dirname, "origin.ts")).href;
  const parent = spawn(process.execPath, ["--input-type=module", "-e", PARENT, origin], {
    cwd: otherCheckout(),
    env: { ...process.env, CI: "", HOLLER_E2E_PORT: "" },
    stdio: ["pipe", "pipe", "ignore"],
  });
  stops.push(() => parent.kill());
  const lines = [];
  const line = () =>
    new Promise((resolve) => {
      if (lines.length > 0) return resolve(lines.shift());
      parent.stdout.once("data", (data) => {
        lines.push(...String(data).trim().split("\n"));
        resolve(lines.shift());
      });
    });
  const chosen = Number(await line());
  await listenFrom(otherCheckout(), chosen);
  parent.stdin.write("go\n");
  assert.equal(Number(await line()), chosen);
});
