import assert from "node:assert/strict";
import test from "node:test";
import { ignoreProblems, ignoresIn, otherIgnoresIn } from "./check-dead-code.mjs";

test("keeps an ignored file only while it holds dead code, and never adds one", () => {
  assert.deepEqual(ignoreProblems(["a.ts"], ["a.ts", "b.ts"], ["a.ts", "c.ts"]), []);
  assert.deepEqual(ignoreProblems(["a.ts"], ["a.ts"], null), []);
  assert.match(ignoreProblems(["a.ts"], [], ["a.ts"])[0], /has no dead code now/);
  assert.match(ignoreProblems(["a.ts"], ["a.ts"], [])[0], /only gets shorter/);
});

test("an ignored file may not hide another kind of dead code", () => {
  const before = ignoresIn({ ignoreIssues: { "a.ts": ["exports"] } });
  const now = ignoresIn({ ignoreIssues: { "a.ts": ["exports", "types"] } });
  assert.match(ignoreProblems(now, now, before)[0], /a\.ts \(types\).*only gets shorter/);
});

test("reads every other ignore, in every workspace", () => {
  const config = {
    ignoreExportsUsedInFile: true,
    workspaces: { ".": { ignoreBinaries: ["java"], entry: ["x"] } },
  };
  assert.deepEqual(otherIgnoresIn(config), [
    "ignoreExportsUsedInFile true",
    ". ignoreBinaries java",
  ]);
});
