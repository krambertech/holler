import assert from "node:assert/strict";
import test from "node:test";
import { unnamed, weakened } from "./check-weakened.mjs";

const files = (changes) => weakened(changes).map(({ file, what }) => `${file}: ${what}`);
const guard = (fields) => JSON.stringify({ check: "pnpm test", fails: "twice", ...fields });
const config = (fields) => JSON.stringify({ rules: {}, overrides: [], ...fields });

test("a deleted guard, or one whose check or failure text changed", () => {
  const file = "guards/send-once.json";
  assert.equal(files([{ file, before: guard(), after: null }]).length, 1);
  assert.equal(files([{ file, before: guard(), after: guard({ check: "true" }) }]).length, 1);
  assert.deepEqual(files([{ file, before: guard(), after: guard({ break: [] }) }]), []);
  assert.deepEqual(files([{ file, before: null, after: guard() }]), []);
});

test("a deleted test, or a test file with fewer cases", () => {
  const file = "send.test.ts";
  const two = 'it("a", f); it.each([1, 2])("b", f);';
  assert.equal(files([{ file, before: two, after: null }]).length, 1);
  assert.match(files([{ file, before: two, after: 'it("a", f);' }])[0], /1 fewer test case/);
  assert.deepEqual(files([{ file, before: two, after: `${two} it("c", f);` }]), []);
});

test("a lint rule turned off, or an existing rule that skips more files", () => {
  const file = ".oxlintrc.json";
  const on = config({ overrides: [{ files: ["src/**"], rules: { "holler/a": "error" } }] });
  const off = config({ overrides: [{ files: ["src/**"], rules: { "holler/a": "off" } }] });
  const skips = config({
    overrides: [{ files: ["src/**"], excludeFiles: ["src/x.ts"], rules: { "holler/a": "error" } }],
  });
  assert.deepEqual(files([{ file, before: on, after: off }]), [
    ".oxlintrc.json: holler/a in src/** is off",
  ]);
  assert.deepEqual(files([{ file, before: on, after: skips }]), [".oxlintrc.json: skips src/x.ts"]);
  assert.deepEqual(files([{ file, before: config(), after: skips }]), []);
});

test("a new suppression, a changed gate, and a deny rule that is gone", () => {
  const suppressed = "// oxlint-disable-next-line x -- because\nsend();";
  assert.equal(files([{ file: "a.ts", before: "send();", after: suppressed }]).length, 1);
  assert.equal(files([{ file: "scripts/check-x.mjs", before: "1", after: "2" }]).length, 1);
  assert.equal(files([{ file: ".github/workflows/ci.yml", before: "1", after: "2" }]).length, 1);
  const deny = (list) => JSON.stringify({ permissions: { deny: list } });
  assert.deepEqual(
    files([{ file: ".claude/settings.json", before: deny(["Bash(deploy*)"]), after: deny([]) }]),
    [".claude/settings.json: no longer denies Bash(deploy*)"],
  );
});

test("wants each file named under the heading, not anywhere in the description", () => {
  const found = [{ file: "a.test.ts", what: "the test file is deleted" }];
  assert.equal(unnamed(found, "I deleted a.test.ts").length, 1);
  assert.equal(unnamed(found, "## Weakened checks\n\n- a.test.ts: moved\n").length, 0);
  assert.equal(unnamed(found, "## Weakened checks\n\nnone\n\n## Notes\n\na.test.ts").length, 1);
});

test("a package script that no longer runs a check", () => {
  const scripts = (verify) => JSON.stringify({ scripts: { verify, dev: "vite" } });
  const before = scripts("pnpm check && pnpm typecheck");
  assert.deepEqual(files([{ file: "package.json", before, after: scripts("pnpm check") }]), [
    'package.json: "verify" no longer runs pnpm typecheck',
  ]);
  const more = scripts("pnpm check && pnpm typecheck && pnpm test");
  assert.deepEqual(files([{ file: "package.json", before, after: more }]), []);
});
