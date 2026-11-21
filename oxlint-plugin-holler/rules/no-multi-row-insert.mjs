import { defineRule } from "@oxlint/plugins";

const message =
  "D1 binds at most 100 values in one statement, so a multi-row insert fails once the list " +
  "grows. Insert one row per statement and run them with runBatch, in chunks of 100.";

function isMethodCall(node, names) {
  return (
    node.type === "CallExpression" &&
    node.callee.type === "MemberExpression" &&
    !node.callee.computed &&
    node.callee.property.type === "Identifier" &&
    names.includes(node.callee.property.name)
  );
}

function isRowList(node) {
  if (node.type === "ArrayExpression") return true;
  return isMethodCall(node, ["map", "flatMap"]) && node.arguments.length === 1;
}

export default defineRule({
  meta: { type: "problem", schema: [] },
  create(context) {
    return {
      CallExpression(node) {
        if (!isMethodCall(node, ["values"]) || node.arguments.length !== 1) return;
        const [rows] = node.arguments;
        if (isRowList(rows)) context.report({ node: rows, message });
      },
    };
  },
});
