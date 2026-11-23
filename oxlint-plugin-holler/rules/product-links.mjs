import { defineRule } from "@oxlint/plugins";

const message =
  "Nothing checks this path against the product's pages, so it can open the not-found page. In the client " +
  "use <Link to> or navigate({ to }), with reloadDocument for a full load; on the server use " +
  "productUrl(env, page) or productPath(page). Only /api/, /slack/, /mcp and /.well-known/ may be written out.";

const serverEndpoint = /^\/(api\/|slack\/|mcp\b|\.well-known\/)/;
const pageKeys = new Set(["loginPage", "consentPage", "page", "callbackURL"]);

function startOf(node) {
  if (node?.type === "Literal") return typeof node.value === "string" ? node.value : "";
  if (node?.type === "TemplateLiteral") return node.quasis[0].value.cooked ?? "";
  if (node?.type === "BinaryExpression") return startOf(node.left);
  return "";
}

function isPagePath(node) {
  if (node?.type === "ConditionalExpression") {
    return isPagePath(node.consequent) || isPagePath(node.alternate);
  }
  if (node?.type === "LogicalExpression") return isPagePath(node.left) || isPagePath(node.right);
  const start = startOf(node);
  return /^\/(?!\/)/.test(start) && !serverEndpoint.test(start);
}

function nameOf(node) {
  if (node?.type === "Identifier") return node.name;
  if (node?.type === "MemberExpression" && !node.computed) return node.property.name;
  return null;
}

function isProductOrigin(node) {
  if (node?.type === "CallExpression") return /^product(Url|Path)$/.test(nameOf(node.callee) ?? "");
  return /^(PRODUCT_URL|productUrl)$/.test(nameOf(node) ?? "");
}

function isPageAfterOrigin(text) {
  return text.startsWith("/") && !serverEndpoint.test(text);
}

function isPageOpener(callee) {
  const name = nameOf(callee);
  const on = callee.type === "MemberExpression" ? nameOf(callee.object) : null;
  if (name === "redirect") return true;
  if (name === "open") return on === "window";
  if (name === "assign" || name === "replace") return on === "location" || on === "history";
  return name === "push" && on === "history";
}

function keyOf(property) {
  if (property.type !== "Property" || property.computed) return null;
  return property.key.type === "Literal" ? property.key.value : property.key.name;
}

export default defineRule({
  meta: { type: "problem", schema: [] },
  create(context) {
    const report = (node) => context.report({ node, message });
    return {
      JSXAttribute(node) {
        if (node.name.name !== "href") return;
        const value =
          node.value?.type === "JSXExpressionContainer" ? node.value.expression : node.value;
        if (isPagePath(value)) report(value);
      },
      CallExpression(node) {
        const [first] = node.arguments;
        if (isPageOpener(node.callee) && isPagePath(first)) report(first);
        if (
          /^(navigate|redirect)$/.test(nameOf(node.callee) ?? "") &&
          first?.type === "ObjectExpression"
        ) {
          const href = first.properties.find((property) => keyOf(property) === "href");
          if (href) report(href);
        }
      },
      NewExpression(node) {
        const [path, origin] = node.arguments;
        if (nameOf(node.callee) === "URL" && isProductOrigin(origin) && isPagePath(path)) {
          report(path);
        }
      },
      AssignmentExpression(node) {
        const target = nameOf(node.left);
        const on = node.left.type === "MemberExpression" ? nameOf(node.left.object) : null;
        if ((target === "location" || on === "location") && isPagePath(node.right)) {
          report(node.right);
        }
      },
      Property(node) {
        if (pageKeys.has(keyOf(node)) && isPagePath(node.value)) report(node.value);
      },
      TemplateLiteral(node) {
        node.expressions.forEach((expression, at) => {
          const after = node.quasis[at + 1].value.cooked ?? "";
          if (isProductOrigin(expression) && isPageAfterOrigin(after)) report(node);
        });
      },
      BinaryExpression(node) {
        if (
          node.operator === "+" &&
          isProductOrigin(node.left) &&
          isPageAfterOrigin(startOf(node.right))
        ) {
          report(node);
        }
      },
    };
  },
});
