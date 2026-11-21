import { defineRule } from "@oxlint/plugins";

const message =
  "Spreading awaited rows into a call passes each row as an argument, and a large read overflows " +
  "the engine's argument limit. Use readInChunks from src/server/batch.ts, or push the rows in a loop.";

function unwrap(node) {
  let at = node;
  while (at?.type === "ParenthesizedExpression" || at?.type === "TSAsExpression")
    at = at.expression;
  return at;
}

export default defineRule({
  meta: { type: "problem", schema: [] },
  create(context) {
    const check = (node) => {
      for (const argument of node.arguments) {
        if (
          argument.type === "SpreadElement" &&
          unwrap(argument.argument)?.type === "AwaitExpression"
        )
          context.report({ node: argument, message });
      }
    };
    return { CallExpression: check, NewExpression: check };
  },
});
