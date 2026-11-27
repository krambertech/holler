import { defineRule } from "@oxlint/plugins";

const message =
  "A div, span or Plate has no role, so an aria-label on it names nothing: screen readers skip it " +
  "and axe refuses it as aria-prohibited-attr. Give it a role that takes a name, such as " +
  'role="status" for a loading state or role="group", or use an element that has one, such as a section.';

const generic = new Set([
  "div",
  "span",
  "p",
  "b",
  "i",
  "em",
  "strong",
  "small",
  "code",
  "pre",
  "Plate",
  "PlateRow",
  "PlateStrip",
  "Underplate",
  "UnderplateStrip",
  "Skeleton",
]);
const naming = new Set(["aria-label", "aria-labelledby"]);

function attributeName(attribute) {
  return attribute.type === "JSXAttribute" ? attribute.name.name : null;
}

export default defineRule({
  meta: { type: "problem", schema: [] },
  create(context) {
    return {
      JSXOpeningElement(node) {
        if (node.name.type !== "JSXIdentifier" || !generic.has(node.name.name)) return;
        if (node.attributes.some((attribute) => attribute.type === "JSXSpreadAttribute")) return;
        const names = node.attributes.map(attributeName);
        if (names.includes("role")) return;
        const label = node.attributes.find((attribute) => naming.has(attributeName(attribute)));
        if (label) context.report({ node: label, message });
      },
    };
  },
});
