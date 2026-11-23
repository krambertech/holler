import assert from "node:assert/strict";
import test from "node:test";
import { ignoreProblems } from "./check-dead-code.mjs";

test("keeps an ignored file only while it holds dead code, and never adds one", () => {
  assert.deepEqual(ignoreProblems(["a.ts"], ["a.ts", "b.ts"], ["a.ts", "c.ts"]), []);
  assert.deepEqual(ignoreProblems(["a.ts"], ["a.ts"], null), []);
  assert.match(ignoreProblems(["a.ts"], [], ["a.ts"])[0], /has no dead code now/);
  assert.match(ignoreProblems(["a.ts"], ["a.ts"], [])[0], /only gets shorter/);
});
