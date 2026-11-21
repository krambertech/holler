import assert from "node:assert/strict";
import { test } from "node:test";
import { mismatch } from "./check-deployment.mjs";

const healthy = { ok: true, worker: "holler", version: "v1", tag: "abc123" };

test("accepts the expected worker at the expected tag", () => {
  assert.equal(mismatch(healthy, "holler", "abc123"), null);
});

test("accepts any tag when none is expected", () => {
  assert.equal(mismatch({ ...healthy, tag: null }, "holler"), null);
});

test("accepts the expected version id when the alias reports no tag", () => {
  assert.equal(mismatch({ ...healthy, tag: "" }, "holler", "v1"), null);
});

test("refuses an older version still answering", () => {
  assert.match(mismatch(healthy, "holler", "def456"), /tag abc123, expected def456/);
});

test("refuses another worker on the origin", () => {
  assert.match(mismatch({ ...healthy, worker: "holler-site" }, "holler"), /expected holler/);
});

test("refuses an unhealthy answer", () => {
  assert.equal(mismatch(null, "holler"), "no healthy answer");
});
