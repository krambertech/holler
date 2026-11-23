import assert from "node:assert/strict";
import test from "node:test";
import { strip, stripped } from "./strip-comments.mjs";

test("removes comments and leaves the code and its directives", () => {
  const source = [
    "/** Sends it. */",
    "export function send(a: number) {",
    "  // Twice as many.",
    "  // oxlint-disable-next-line no-x -- because",
    "  return a * 2; // doubled",
    "}",
    "",
  ].join("\n");
  assert.equal(
    stripped("a.ts", source),
    [
      "export function send(a: number) {",
      "  // oxlint-disable-next-line no-x -- because",
      "  return a * 2;",
      "}",
      "",
    ].join("\n"),
  );
  assert.equal(
    stripped("a.tsx", "const a = <p>\n  {/* why */}\n  hi\n</p>;\n").includes("why"),
    false,
  );
});

test("keeps a line break that ends a statement", () => {
  const source = "function f() { return /* reason\n */ 42; }";
  assert.match(strip("a.ts", source), /return\s*\n\s*42/);
  assert.notEqual(stripped("a.ts", source), null);
});

test("leaves text that only looks like a comment", () => {
  const source = 'const url = "https://holler.team"; const a = `/* not */`;\n';
  assert.equal(stripped("a.ts", source), source);
});
