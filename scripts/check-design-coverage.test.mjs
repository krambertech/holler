import assert from "node:assert/strict";
import test from "node:test";
import { documentedNames, exportedComponents, isCovered } from "./check-design-coverage.mjs";

test("finds exported components, not helpers", () => {
  const source =
    "export function Plate() {}\nexport const buttonClasses = () => {};\nfunction Inner() {}";
  assert.deepEqual(exportedComponents(source), ["Plate"]);
});

test("reads entry names, including comma lists, and foundation covers", () => {
  const names = documentedNames(['name: "Plate, PlateRow"', 'covers: ["Mark", "Logo"]']);
  assert.deepEqual([...names].sort(), ["Logo", "Mark", "Plate", "PlateRow"]);
});

test("reads export lists and covers parts through their family", () => {
  assert.deepEqual(exportedComponents("export { Dialog, DialogContent, usePlaceShape };"), [
    "Dialog",
    "DialogContent",
  ]);
  const documented = new Set(["Dialog"]);
  assert.equal(isCovered("DialogContent", documented), true);
  assert.equal(isCovered("Drawer", documented), false);
});

test("a family covers its parts, never a word that only starts the same", () => {
  assert.equal(isCovered("MarkdownNote", new Set(["Mark"])), false);
  assert.equal(isCovered("MarkNote", new Set(["Mark"])), true);
});
