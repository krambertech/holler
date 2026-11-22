import { defineRule } from "@oxlint/plugins";

const message =
  "An effect written as () => expression returns that expression, and React calls whatever " +
  "comes back as its cleanup, so the page crashes when it is not a function. Write the body in " +
  "braces, () => { ... }, and return the cleanup there when there is one.";

const hooks = ["useEffect", "useLayoutEffect", "useInsertionEffect"];

function hookName(callee) {
  if (callee.type === "Identifier") return callee.name;
  if (callee.type === "MemberExpression" && !callee.computed) return callee.property.name;
  return null;
}

function isCleanup(body) {
  return body.type === "ArrowFunctionExpression" || body.type === "FunctionExpression";
}

export default defineRule({
  meta: { type: "problem", schema: [] },
  create(context) {
    return {
      CallExpression(node) {
        if (!hooks.includes(hookName(node.callee))) return;
        const [effect] = node.arguments;
        if (effect?.type !== "ArrowFunctionExpression" || !effect.expression) return;
        if (isCleanup(effect.body)) return;
        context.report({ node: effect, message });
      },
    };
  },
});
