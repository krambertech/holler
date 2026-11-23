import assert from "node:assert/strict";
import test from "node:test";
import { decide } from "./stop-gate.mjs";

const failing = () => ({ status: 1, output: "holler(no-comments)" });
const session = { changed: true, installed: true, blocks: 0, check: failing };

test("blocks a session whose changes fail the check, and says never to loosen it", () => {
  const { block, message } = decide(session);
  assert.equal(block, true);
  assert.match(message, /holler\(no-comments\)/);
  assert.match(message, /Never skip/);
});

test("lets a session finish when the check passes or nothing changed", () => {
  assert.equal(decide({ ...session, check: () => ({ status: 0, output: "" }) }).block, false);
  assert.equal(decide({ ...session, changed: false }).block, false);
});

test("lets a third try through, so a session never loops forever", () => {
  assert.equal(decide({ ...session, blocks: 1 }).block, true);
  assert.equal(decide({ ...session, blocks: 2 }).block, false);
});
