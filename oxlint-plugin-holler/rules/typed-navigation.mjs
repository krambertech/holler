import { defineRule } from "@oxlint/plugins";

const message =
  "Navigate with `to`, `params` and `search`, so TanStack Router's types refuse a route that does not " +
  "exist. An `href` typechecks for any path and lands on the not-found page when the route is missing.";

const navigators = new Set(["navigate", "redirect"]);

function calleeName(callee) {
  if (callee.type === "Identifier") return callee.name;
  if (callee.type === "MemberExpression" && callee.property.type === "Identifier") {
    return callee.property.name;
  }
  return null;
}

export default defineRule({
  meta: { type: "problem", schema: [] },
  create(context) {
    return {
      CallExpression(node) {
        if (!navigators.has(calleeName(node.callee))) return;
        const [options] = node.arguments;
        if (options?.type !== "ObjectExpression") return;
        for (const property of options.properties) {
          if (
            property.type === "Property" &&
            !property.computed &&
            ((property.key.type === "Identifier" && property.key.name === "href") ||
              (property.key.type === "Literal" && property.key.value === "href"))
          ) {
            context.report({ node: property, message });
          }
        }
      },
    };
  },
});
