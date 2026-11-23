import { defineRule } from "@oxlint/plugins";

const message =
  "A mock of our own module keeps passing when the real one breaks. Run the real service: testDb() " +
  "from src/server/test-db.ts, deliveryEnv() from src/server/test-delivery.ts for anything that sends, " +
  "and the FakeSlack that devSlack() returns. Then assert what was stored, sent to Slack or returned.";

const mockers = new Set(["mock", "doMock"]);
const isOurs = (specifier) => /^(\.{1,2}\/|@\/|@holler\/)/.test(specifier);

function viMethod(call) {
  const { callee } = call;
  if (callee.type !== "MemberExpression" || callee.object.type !== "Identifier") return null;
  if (callee.object.name !== "vi" && callee.object.name !== "vitest") return null;
  if (callee.property.type === "Identifier" && !callee.computed) return callee.property.name;
  return callee.property.type === "Literal" ? callee.property.value : null;
}

function specifierOf(node) {
  if (node?.type === "Literal") return String(node.value);
  if (node?.type === "TemplateLiteral") return node.quasis[0].value.raw;
  return node?.type === "ImportExpression" ? specifierOf(node.source) : "";
}

function importedModule(node) {
  const value = node?.type === "AwaitExpression" ? node.argument : node;
  return value?.type === "ImportExpression" && isOurs(specifierOf(value));
}

export default defineRule({
  meta: { type: "problem", schema: [] },
  create(context) {
    const modules = new Set();
    return {
      ImportNamespaceSpecifier(node) {
        if (isOurs(node.parent.source.value)) modules.add(node.local.name);
      },
      VariableDeclarator(node) {
        if (node.id.type === "Identifier" && importedModule(node.init)) modules.add(node.id.name);
      },
      CallExpression(node) {
        const method = viMethod(node);
        const [target] = node.arguments;
        const mocked = mockers.has(method) && isOurs(specifierOf(target));
        const spied =
          method === "spyOn" &&
          (importedModule(target) || (target?.type === "Identifier" && modules.has(target.name)));
        if (mocked || spied) context.report({ node: target, message });
      },
    };
  },
});
