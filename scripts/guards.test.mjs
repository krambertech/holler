import assert from "node:assert/strict";
import test from "node:test";
import { coverageProblems, guardProblems, shardOf, verdict } from "./guards.mjs";

const guard = {
  rule: "A send happens once",
  layer: "test",
  past: "#10: two clicks sent twice",
  check: "pnpm test",
  fails: "sent twice",
  break: [{ file: "send.ts", find: "guarded()", replace: "true" }],
};
const read = (file) => (file === "send.ts" ? "if (guarded()) send();" : null);

test("accepts a guard whose break matches the code once", () => {
  assert.deepEqual(guardProblems("send-once", guard, read), []);
});

test("refuses a guard whose code moved, and says what to write", () => {
  const [problem] = guardProblems("send-once", guard, () => "send();");
  assert.match(problem, /is in send\.ts 0 times/);
  const [gone] = guardProblems("send-once", guard, () => null);
  assert.match(gone, /send\.ts is gone/);
});

test("refuses a find that matches more than once", () => {
  const [problem] = guardProblems("send-once", guard, () => "guarded(); guarded();");
  assert.match(problem, /2 times/);
});

test("refuses a guard with no proof, with both proofs, or with no past mistake", () => {
  const { break: edits, ...bare } = guard;
  assert.match(guardProblems("send-once", bare, read)[0], /needs one proof/);
  assert.match(
    guardProblems("send-once", { ...bare, break: edits, refuses: "x" }, read)[0],
    /needs one proof/,
  );
  assert.match(guardProblems("send-once", { ...guard, past: "" }, read)[0], /needs "past"/);
});

test("refuses a layer or field it does not know", () => {
  assert.match(guardProblems("send-once", { ...guard, layer: "docs" }, read)[0], /"layer" is one/);
  assert.match(guardProblems("send-once", { ...guard, notes: "x" }, read)[0], /unknown field/);
});

test("names a lint rule or check script that no guard proves", () => {
  const own = { rules: ["no-spread-rows"], scripts: ["check-styling.mjs"] };
  assert.equal(coverageProblems({ a: guard }, own).length, 2);
  const proved = {
    a: { ...guard, fails: "holler(no-spread-rows)" },
    b: { ...guard, check: "pnpm check:styling" },
  };
  assert.deepEqual(coverageProblems(proved, own), []);
});

test("splits guards across shards without losing one", () => {
  const ids = ["a", "b", "c", "d", "e"];
  const shards = ["1/2", "2/2"].flatMap((shard) => shardOf(ids, shard));
  assert.deepEqual(shards.sort(), ids);
});

test("a check that passes on broken code, or fails for another reason, proves nothing", () => {
  assert.match(verdict(guard, { status: 0, output: "" }), /passed on the broken code/);
  assert.match(verdict(guard, { status: 1, output: "timeout" }), /another reason/);
  assert.equal(verdict(guard, { status: 1, output: "x sent twice x" }), null);
});
