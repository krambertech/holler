import assert from "node:assert/strict";
import test from "node:test";
import { compare, keptSincePush } from "./check-migrations.mjs";

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

test("fails when a migration this branch pushed is renamed, so the preview cannot apply it twice", () => {
  const pushed = { "0004_main.sql": "m", "0005_mine.sql": "x" };
  const main = { "0004_main.sql": "m", "0005_theirs.sql": "t" };
  const renamed = { "0004_main.sql": "m", "0005_theirs.sql": "t", "0006_mine.sql": "x" };
  const [problem] = keptSincePush(pushed, main, renamed);
  assert.match(problem, /0005_mine\.sql was renamed or deleted after this branch pushed it/);
  assert.match(problem, /PREVIEW_RESET=0005_mine\.sql/);
});

test("fails when a pushed migration changed, and passes when it is kept beside main's", () => {
  const pushed = { "0005_mine.sql": "x" };
  const main = { "0005_theirs.sql": "t" };
  assert.match(keptSincePush(pushed, main, { "0005_mine.sql": "y" })[0], /changed after/);
  assert.deepEqual(
    keptSincePush(pushed, main, { "0005_theirs.sql": "t", "0005_mine.sql": "x" }),
    [],
  );
});

test("leaves main's migrations to compare, and lets a reset migration go", () => {
  assert.deepEqual(keptSincePush({ "0004_main.sql": "m" }, { "0004_main.sql": "m" }, {}), []);
  assert.deepEqual(keptSincePush({ "0005_mine.sql": "x" }, {}, {}, ["0005_mine.sql"]), []);
});
