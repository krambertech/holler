import { defineRule } from "@oxlint/plugins";

const message =
  "D1 binds at most 100 values in one statement, so a list that can grow fails the lookup once it does. " +
  "Look it up in chunks with inChunks from server/batch.ts, pass a fixed list or a subquery, or, when a " +
  "schema limit keeps the list short, say which: oxlint-disable-next-line holler/bounded-in-array -- <the limit>.";

const lookups = new Set(["inArray", "notInArray"]);

function isSubquery(node) {
  let at = node;
  while (at?.type === "CallExpression") {
    const { callee } = at;
    if (callee.type !== "MemberExpression") return false;
    if (callee.property.type === "Identifier" && /^select/.test(callee.property.name)) return true;
    at = callee.object;
  }
  return false;
}

function isBounded(list) {
  if (!list) return true;
  if (list.type === "ArrayExpression") return true;
  if (list.type === "Identifier" && list.name === "chunk") return true;
  if (
    list.type === "CallExpression" &&
    list.callee.type === "MemberExpression" &&
    list.callee.property.type === "Identifier" &&
    list.callee.property.name === "slice" &&
    list.arguments.length === 2
  ) {
    return true;
  }
  return isSubquery(list);
}

export default defineRule({
  meta: { type: "problem", schema: [] },
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type !== "Identifier" || !lookups.has(node.callee.name)) return;
        const list = node.arguments[1];
        if (!isBounded(list)) context.report({ node: list, message });
      },
    };
  },
});
