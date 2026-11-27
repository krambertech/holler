import { defineRule } from "@oxlint/plugins";

const message =
  "aria-label and aria-labelledby name only an element with a role. A div, a span, a Plate or a Skeleton " +
  "has none, so axe reports aria-prohibited-attr. Give it a role (group, img, status), use an element " +
  "that has one (section, nav, ul), or drop the name.";

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
  "s",
  "u",
  "sub",
  "sup",
  "del",
  "ins",
  "q",
  "data",
  "Plate",
  "PlateRow",
  "PlateStrip",
  "Underplate",
  "UnderplateStrip",
  "Skeleton",
]);

const naming = new Set(["aria-label", "aria-labelledby"]);

function attributeName(attribute) {
  return attribute.type === "JSXAttribute" && attribute.name.type === "JSXIdentifier"
    ? attribute.name.name
    : null;
}

export default defineRule({
  meta: { type: "problem", schema: [] },
  create(context) {
    return {
      JSXOpeningElement(node) {
        if (node.name.type !== "JSXIdentifier" || !generic.has(node.name.name)) return;
        const names = node.attributes.map(attributeName);
        if (names.includes("role")) return;
        for (const attribute of node.attributes) {
          if (naming.has(attributeName(attribute))) context.report({ node: attribute, message });
        }
      },
    };
  },
});
