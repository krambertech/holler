import { defineRule } from "@oxlint/plugins";

const message =
  "A rerun, a skip or a sleep hides why a test fails. Find the cause, wait for the state you need " +
  "(a web-first assertion, waitForURL, a promise the test resolves), or delete the test and say why " +
  "in the pull request. A skip that depends on where it runs is test.skip(condition, reason).";

const roots = new Set(["test", "it", "describe", "suite"]);
const escapes = new Set(["skip", "only", "fixme", "todo", "skipIf", "runIf"]);
const retryOptions = new Set(["retry", "retries"]);
const config = /(?:playwright|vitest)(?:\.[\w-]+)?\.config\.[cm]?[jt]s$/;

function nameOf(node, computed) {
  if (node.type === "Identifier" && !computed) return node.name;
  return node.type === "Literal" ? node.value : null;
}

function pathOf(node) {
  if (node.type === "Identifier") return [node.name];
  if (node.type === "CallExpression") return pathOf(node.callee);
  if (node.type === "MemberExpression") {
    const object = pathOf(node.object);
    return object && [...object, nameOf(node.property, node.computed)];
  }
  return null;
}

function isText(node) {
  return node?.type === "Literal"
    ? typeof node.value === "string" && node.value.trim() !== ""
    : node?.type === "TemplateLiteral";
}

function skipsForAReason(path, call) {
  if (path.at(-1) !== "skip" || path.includes("describe") || call?.type !== "CallExpression") {
    return false;
  }
  const [condition, reason] = call.arguments;
  if (call.arguments.length !== 2 || !isText(reason)) return false;
  return condition.type !== "Literal" && condition.type !== "TemplateLiteral";
}

function isTestOption(property) {
  const call = property.parent?.parent;
  return call?.type === "CallExpression" && roots.has(pathOf(call.callee)?.[0]);
}

export default defineRule({
  meta: { type: "problem", schema: [] },
  create(context) {
    const inConfig = config.test(context.filename);
    return {
      MemberExpression(node) {
        const name = nameOf(node.property, node.computed);
        if (name === "waitForTimeout") context.report({ node: node.property, message });
        if (!escapes.has(name)) return;
        const path = pathOf(node);
        if (!path || !(roots.has(path[0]) || path[0] === "testInfo")) return;
        const call = node.parent?.callee === node ? node.parent : null;
        if (!skipsForAReason(path, call)) context.report({ node: node.property, message });
      },
      Property(node) {
        if (!retryOptions.has(nameOf(node.key, node.computed))) return;
        if (inConfig || isTestOption(node)) context.report({ node: node.key, message });
      },
      CallExpression(node) {
        if (node.callee.type === "Identifier" && node.callee.name === "setTimeout") {
          context.report({ node: node.callee, message });
        }
      },
      ImportDeclaration(node) {
        if (/^(node:)?timers\/promises$/.test(node.source.value)) {
          context.report({ node: node.source, message });
        }
      },
    };
  },
});
