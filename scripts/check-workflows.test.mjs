import assert from "node:assert/strict";
import test from "node:test";
import { gateProblems, workflowProblems } from "./check-workflows.mjs";

const ci = (needs, deploy = "    needs: [ready]\n    if: needs.ready.result == 'success'\n") =>
  `on: push\njobs:\n  verify:\n    steps: []\n  e2e:\n    steps: []\n  ready:\n    needs: [${needs}]\n  deploy:\n${deploy}`;

test("every job is needed by the gate, and the deploy waits for the gate by name", () => {
  assert.deepEqual(gateProblems(ci("verify, e2e")), []);
  assert.match(gateProblems(ci("verify"))[0], /does not need "e2e"/);
  assert.match(gateProblems(ci("verify, e2e", "    needs: [verify]\n"))[0], /red build/);
  assert.match(gateProblems(ci("verify, e2e", "    needs: [ready]\n"))[0], /by name/);
  assert.match(gateProblems("jobs:\n  verify:\n")[0], /has no "ready"/);
});

test("actions are pinned, permissions are set, and no step may fail quietly", () => {
  const text =
    "jobs:\n  a:\n    steps:\n      - uses: actions/checkout@v4\n        continue-on-error: true\n";
  assert.equal(workflowProblems("x.yml", text).length, 3);
  const sha = "a".repeat(40);
  const good = `permissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - uses: actions/checkout@${sha} # v4\n  b:\n    uses: ./.github/workflows/ci.yml\n`;
  assert.deepEqual(workflowProblems("x.yml", good), []);
});
