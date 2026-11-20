import assert from "node:assert/strict";
import test from "node:test";
import { frontmatterColours, namedComponents } from "./check-design.mjs";

test("reads the colours from DESIGN.md's frontmatter", () => {
  const md = '---\nname: Holler\ncolors:\n  canvas: "#f8f6f4"\n  plate: "#ffffff"\n---\n';
  assert.deepEqual(frontmatterColours(md).entries, [
    ["canvas", "#f8f6f4"],
    ["plate", "#ffffff"],
  ]);
});

test("finds component names in code font, not in fenced examples", () => {
  const md = "Use `Plate` and `HollerRow`, not `div`.\n\n```tsx\n`Ignored`\n```\n";
  assert.deepEqual(namedComponents(md), ["Plate", "HollerRow"]);
});
