import assert from "node:assert/strict";
import test from "node:test";
import { limitsIn, looseLimits, measuredFrom, risenLimits, roundUp } from "./check-limits.mjs";

const limits = (files, max = 500, exempt = ["**/*.test.*"]) =>
  limitsIn({
    rules: { "eslint/max-lines": ["error", { max }] },
    overrides: [
      { files: exempt, rules: { "eslint/max-lines": "off" } },
      ...Object.entries(files).map(([file, most]) => ({
        files: [file],
        rules: { "eslint/max-lines": ["error", { max: most }] },
      })),
    ],
  });

test("reads the worst number Oxlint measured in each file", () => {
  const complexity = (n) => ({
    filename: "a.ts",
    code: "eslint(complexity)",
    message: `function \`a\` has a complexity of ${n}. Maximum allowed is 25.`,
  });
  const lines = {
    filename: "a.ts",
    code: "eslint(max-lines)",
    message: "File has too many lines (603).",
  };
  assert.deepEqual(measuredFrom([complexity(26), complexity(54), complexity(30), lines]), {
    "a.ts": { "eslint/complexity": 54, "eslint/max-lines": 603 },
  });
});

test("rounds a limit up to its step, so a small change leaves it alone", () => {
  assert.equal(roundUp("eslint/max-lines", 1115), 1150);
  assert.equal(roundUp("eslint/max-lines", 1150), 1150);
  assert.equal(roundUp("eslint/complexity", 51), 55);
});

test("refuses a limit looser than its file needs", () => {
  const needs = (actual) => ({ "a.ts": { "eslint/max-lines": actual } });
  assert.deepEqual(looseLimits(limits({ "a.ts": 650 }), needs(603)), []);
  assert.match(looseLimits(limits({ "a.ts": 650 }), needs(600))[0], /falls to 600/);
  assert.match(looseLimits(limits({ "a.ts": 650 }), {})[0], /inside the default/);
});

test("refuses a limit that rises, a new one, a higher default and a wider exemption", () => {
  const before = limits({ "a.ts": 650 });
  assert.deepEqual(risenLimits(before, limits({ "a.ts": 600 })), []);
  assert.deepEqual(risenLimits(before, limits({})), []);
  assert.match(risenLimits(before, limits({ "a.ts": 700 }))[0], /rose from 650 to 700/);
  assert.match(risenLimits(before, limits({ "b.ts": 550 }))[0], /b\.ts.*rose from 500 to 550/);
  assert.match(risenLimits(before, limits({}, 600))[0], /the default.*rose/);
  assert.match(risenLimits(before, limits({}, 500, ["**/*.ts"]))[0], /never changes/);
});
