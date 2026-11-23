import { defineRule } from "@oxlint/plugins";

const message =
  "Each browser test has its own workspace. What a beforeAll makes, or a serial run leaves behind, is " +
  "shared between tests. Make it in beforeEach or in the test: signInAs(page, persona) and the " +
  "requestAs fixture from e2e/fixtures.ts both use the test's own workspace.";

const shared = new Set(["beforeAll", "afterAll", "serial"]);

export default defineRule({
  meta: { type: "problem", schema: [] },
  create(context) {
    return {
      MemberExpression(node) {
        const { property } = node;
        if (!node.computed && property.type === "Identifier" && shared.has(property.name)) {
          context.report({ node: property, message });
        }
      },
      Property(node) {
        if (
          node.key.type === "Identifier" &&
          node.key.name === "mode" &&
          node.value.type === "Literal" &&
          node.value.value === "serial"
        ) {
          context.report({ node: node.value, message });
        }
      },
    };
  },
});
