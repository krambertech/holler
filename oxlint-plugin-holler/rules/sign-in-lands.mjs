import { defineRule } from "@oxlint/plugins";

const message =
  "Sign in with signInAs(page, persona, to) from e2e/a11y.ts. It lands on `to` and waits for it, so " +
  "the sign-in redirect never races the test's next navigation, which WebKit reports as an interrupted goto.";

const devSignIn = /\/api\/dev\/sign-in/;

function awaitedCall(statement) {
  if (statement?.type !== "ExpressionStatement") return null;
  const awaited = statement.expression;
  if (awaited?.type !== "AwaitExpression") return null;
  return awaited.argument?.type === "CallExpression" ? awaited.argument : null;
}

function isSignInAs(call) {
  return call?.callee.type === "Identifier" && call.callee.name === "signInAs";
}

function isGoto(call) {
  return (
    call?.callee.type === "MemberExpression" &&
    call.callee.property.type === "Identifier" &&
    call.callee.property.name === "goto"
  );
}

function checkBody(context, body) {
  for (let at = 1; at < body.length; at += 1) {
    const call = awaitedCall(body[at]);
    if (isGoto(call) && isSignInAs(awaitedCall(body[at - 1]))) {
      context.report({ node: call, message });
    }
  }
}

export default defineRule({
  meta: { type: "problem", schema: [] },
  create(context) {
    return {
      Program(node) {
        checkBody(context, node.body);
      },
      BlockStatement(node) {
        checkBody(context, node.body);
      },
      Literal(node) {
        if (typeof node.value === "string" && devSignIn.test(node.value)) {
          context.report({ node, message });
        }
      },
      TemplateLiteral(node) {
        if (node.quasis.some((quasi) => devSignIn.test(quasi.value.raw))) {
          context.report({ node, message });
        }
      },
    };
  },
});
