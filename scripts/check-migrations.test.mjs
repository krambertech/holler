import assert from "node:assert/strict";
import test from "node:test";
import { compare } from "./check-migrations.mjs";

test("passes when every recorded migration is unchanged", () => {
  assert.deepEqual(compare({ "0000_a.sql": "x" }, { "0000_a.sql": "x" }), {
    problems: [],
    unrecorded: [],
  });
});

test("fails on a changed or deleted migration", () => {
  const { problems } = compare({ "0000_a.sql": "x", "0001_b.sql": "y" }, { "0000_a.sql": "z" });
  assert.equal(problems.length, 2);
  assert.match(problems[0], /changed/);
  assert.match(problems[1], /missing/);
});

test("lists new migrations to record", () => {
  assert.deepEqual(compare({}, { "0000_a.sql": "x" }).unrecorded, ["0000_a.sql"]);
});
