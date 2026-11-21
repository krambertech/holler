import { defineRule } from "@oxlint/plugins";

const message =
  "response_owners links an anonymous response to its person. Only the person's own answers " +
  "(services/own-answers.ts) read it, and only recordResponse and the dev seed write it, so results, exports, " +
  "the API, MCP and Slack can never say who gave an anonymous answer. docs/adr/0003.";

const table = /\bresponse_owners\b/;

export default defineRule({
  meta: { type: "problem", schema: [] },
  create(context) {
    return {
      Identifier(node) {
        if (node.name !== "responseOwners") return;
        const { parent } = node;
        if (parent?.type === "Property" && parent.shorthand && parent.key === node) return;
        context.report({ node, message });
      },
      Literal(node) {
        if (typeof node.value === "string" && table.test(node.value)) {
          context.report({ node, message });
        }
      },
      TemplateElement(node) {
        if (table.test(node.value.raw)) context.report({ node, message });
      },
    };
  },
});
