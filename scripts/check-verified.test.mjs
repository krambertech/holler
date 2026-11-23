import assert from "node:assert/strict";
import test from "node:test";
import { verifiedProblem } from "./check-verified.mjs";

test("takes a line that names what ran, or why nothing did", () => {
  assert.equal(verifiedProblem("## Summary\n\nVerified: pnpm verify; drove home"), null);
  assert.equal(verifiedProblem("Verified: none, because it only edits a doc"), null);
});

test("refuses a missing line, a vague one, and none without a reason", () => {
  assert.match(verifiedProblem("All good"), /no "Verified:" line/);
  assert.match(verifiedProblem(null), /no "Verified:" line/);
  assert.match(verifiedProblem("Verified: tested"), /names nothing that ran/);
  assert.match(verifiedProblem("Verified: none"), /because/);
});
