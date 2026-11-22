import assert from "node:assert/strict";
import test from "node:test";
import {
  configOf,
  hashOf,
  literal,
  problemWith,
  readOutput,
  recordOf,
  runsOf,
  section,
  syncProblems,
} from "./check-models.mjs";

const model = {
  spec: "Delivery.tla",
  promises: { NothingPostsTwice: "Nothing posts twice.", ClosedIsToldOnce: "Told once." },
  constants: { Hollers: ["Holler 1"], PostKeys: true, Refusals: 1 },
  runs: {
    sending: { says: "One Holler." },
    closing: { says: "Two Hollers.", constants: { Hollers: ["Holler 1", "Holler 2"] } },
    "no-key": { past: "#10", breaks: "NothingPostsTwice", constants: { PostKeys: false } },
    dies: { like: "closing", finding: "It dies.", breaks: "ClosedIsToldOnce" },
  },
};
const [sending, , noKey, dies] = runsOf("delivery", model);

const violated = `Error: Invariant NothingPostsTwice is violated.
Error: The behavior up to this point is:
State 1: <Initial predicate>
/\\ queue = {}
/\\ said = <<"the Holler is a draft">>

State 2: <Posts line 1, col 1 to line 2, col 2 of module Delivery>
/\\ queue = {}
/\\ said = << "consumer 1",
   "posts", "",
   "reminder", 2 >>
`;

test("writes TLA+ values", () => {
  assert.equal(literal(["a", "b"]), '{"a", "b"}');
  assert.equal(literal([]), "{}");
  assert.equal(literal(true), "TRUE");
  assert.equal(literal(2), "2");
});

test("a run takes the model's constants, then those of the run it is like, then its own", () => {
  assert.match(configOf(dies), /Hollers = \{"Holler 1", "Holler 2"\}/);
  assert.match(configOf(noKey), /PostKeys = FALSE/);
  assert.match(configOf(noKey), /Refusals = 1/);
});

test("the current design is checked against every promise, a mistake against the one it breaks", () => {
  assert.match(configOf(sending), /INVARIANTS NothingPostsTwice ClosedIsToldOnce\n/);
  assert.match(configOf(noKey), /INVARIANTS NothingPostsTwice\n/);
});

test("tells a counterexample as steps in the spec's words", () => {
  const { broken, holds, steps } = readOutput(violated);
  assert.deepEqual({ broken, holds }, { broken: "NothingPostsTwice", holds: false });
  assert.deepEqual(steps, ["the Holler is a draft", "consumer 1 posts reminder 2"]);
});

test("the current design passes only when TLC finished and found nothing", () => {
  const finished =
    "No error has been found.\n12 states generated, 7 distinct states found, 0 states left";
  assert.equal(problemWith(sending, { output: finished, ...readOutput(finished) }), null);
  assert.match(
    problemWith(sending, { output: violated, ...readOutput(violated) }),
    /current design breaks NothingPostsTwice: Nothing posts twice\./,
  );
  const crashed = "Parse Error";
  assert.match(problemWith(sending, { output: crashed, ...readOutput(crashed) }), /did not finish/);
  assert.match(problemWith(noKey, { output: crashed, ...readOutput(crashed) }), /did not finish/);
});

test("a past bug has to break the promise it names", () => {
  assert.equal(problemWith(noKey, { output: violated, ...readOutput(violated) }), null);
  assert.match(problemWith(noKey, { holds: true, broken: null }), /no longer catches it/);
});

test("a finding that stops breaking its promise says to update the record", () => {
  assert.match(problemWith(dies, { holds: true, broken: null }), /delete the run from model\.json/);
});

test("records each counterexample under what it is", () => {
  const result = readOutput(violated);
  const text = recordOf(
    [noKey, dies].map((run) => ({ kind: run.kind, text: section(run, result) })),
  );
  assert.ok(text.indexOf("## delivery/dies") < text.indexOf("# Past bugs"));
  assert.ok(text.indexOf("# Past bugs") < text.indexOf("## delivery/no-key"));
  assert.match(text, /2\. consumer 1 posts reminder 2/);
});

const code = "export async function close(db) {\n  // once\n  await claim(db, [1, 2]);\n}\n";

test("a hash ignores comments, spacing and trailing commas, and nothing else", () => {
  const hash = hashOf(code, "close");
  assert.equal(
    hashOf(
      "async function other() {}\nexport async function close(db) { await claim(db, [1,\n 2,],); }",
      "close",
    ),
    hash,
  );
  assert.notEqual(hashOf(code.replace("2", "3"), "close"), hash);
  assert.notEqual(hashOf(code.replace("await ", ""), "close"), hash);
  assert.notEqual(hashOf(code.replace("claim(db", "`a b`; claim(db"), "close"), hash);
});

test("finds a constant, and nothing when the name is gone", () => {
  assert.notEqual(hashOf("export const sends = { invite: 1 };", "sends"), null);
  assert.equal(hashOf(code, "open"), null);
});

test("a covered function that changed or went has to be confirmed again", () => {
  const covers = { commit: "abc", code: { "a.ts#close": hashOf(code, "close"), "a.ts#open": "x" } };
  assert.deepEqual(
    syncProblems(
      "delivery",
      { ...covers, code: { "a.ts#close": hashOf(code, "close") } },
      () => code,
    ),
    [],
  );
  const [problem] = syncProblems("delivery", covers, () => code.replace("claim", "take"));
  assert.match(problem, /a\.ts#close changed/);
  assert.match(problem, /a\.ts#open is gone/);
  assert.match(problem, /check:models --confirm delivery/);
});
