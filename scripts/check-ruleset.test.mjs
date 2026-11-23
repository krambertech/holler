import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { drift } from "./check-ruleset.mjs";

const wanted = JSON.parse(
  readFileSync(new URL("../.github/rulesets/main.json", import.meta.url), "utf8"),
);
const rule = (type) => wanted.rules.find((own) => own.type === type)?.parameters;

test("main takes only squashed pull requests that are green and up to date, from anyone", () => {
  assert.deepEqual(rule("pull_request").allowed_merge_methods, ["squash"]);
  assert.equal(rule("required_status_checks").strict_required_status_checks_policy, true);
  assert.deepEqual(
    rule("required_status_checks").required_status_checks.map((check) => check.context),
    ["ready", "protect"],
  );
  assert.deepEqual(wanted.bypass_actors, []);
  for (const type of ["deletion", "non_fast_forward", "required_linear_history"]) {
    assert.ok(
      wanted.rules.some((own) => own.type === type),
      type,
    );
  }
});

test("says what GitHub no longer enforces", () => {
  assert.deepEqual(drift(wanted, wanted), []);
  assert.match(drift(wanted, null)[0], /nothing protects main/);
  const loose = structuredClone(wanted);
  loose.enforcement = "disabled";
  loose.bypass_actors = [{ actor_id: 5 }];
  loose.rules = loose.rules.filter((own) => own.type !== "deletion");
  const checks = loose.rules.find((own) => own.type === "required_status_checks").parameters;
  checks.required_status_checks = [];
  assert.equal(drift(wanted, loose).length, 4);
});

test("says when the ruleset no longer covers main", () => {
  const elsewhere = structuredClone(wanted);
  elsewhere.conditions.ref_name.include = ["refs/heads/unused"];
  assert.match(drift(wanted, elsewhere)[0], /it includes/);
  const skipping = structuredClone(wanted);
  skipping.conditions.ref_name.exclude = ["refs/heads/main"];
  assert.match(drift(wanted, skipping)[0], /it excludes/);
});

test("says when the ruleset allows another way to merge", () => {
  const rebasing = structuredClone(wanted);
  const pull = rebasing.rules.find((own) => own.type === "pull_request").parameters;
  pull.allowed_merge_methods = ["squash", "rebase"];
  assert.match(drift(wanted, rebasing)[0], /allowed_merge_methods/);
});
