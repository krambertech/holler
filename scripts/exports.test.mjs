import assert from "node:assert/strict";
import test from "node:test";
import { exportedNames } from "./exports.mjs";

test("reads declarations and export lists by their public name", () => {
  const source = [
    "export function Plate() {}",
    "export const buttonClasses = () => {};",
    "export interface Props {}",
    "function Inner() {}",
    "export { Inner as Outer, type Shape, Chip };",
  ].join("\n");
  assert.deepEqual(exportedNames(source), [
    "Plate",
    "buttonClasses",
    "Props",
    "Outer",
    "Shape",
    "Chip",
  ]);
});

test("leaves type-only exports out when asked", () => {
  const source = "export type Shape = 1;\nexport type { Tone };\nexport { type Axis, Chip };";
  assert.deepEqual(exportedNames(source, { types: false }), ["Chip"]);
});
