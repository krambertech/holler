import { testRule } from "../test/run.mjs";

const filename = "hollers.ts";

testRule("bounded-in-array", {
  message:
    "D1 binds at most 100 values in one statement, so a list that can grow fails the lookup once it does. " +
    "Look it up in chunks with inChunks from server/batch.ts, pass a fixed list or a subquery, or, when a " +
    "schema limit keeps the list short, say which: oxlint-disable-next-line holler/bounded-in-array -- <the limit>.",
  valid: [
    { filename, code: 'inArray(hollers.status, ["live", "closed"]);' },
    { filename, code: "for (const chunk of inChunks(ids)) inArray(members.id, chunk);" },
    { filename, code: "inArray(people.id, ids.slice(at, at + 90));" },
    {
      filename,
      code: 'inArray(recipients.hollerId, db.select({ id: hollers.id }).from(hollers).where(eq(hollers.status, "live")));',
    },
  ],
  invalid: [
    { filename, code: "inArray(members.id, ids);", errors: ["ids"] },
    {
      filename,
      code: "notInArray(options.questionId, qs.map((q) => q.id));",
      errors: ["qs.map((q) => q.id)"],
    },
    { filename, code: "inArray(people.id, ids.slice(at));", errors: ["ids.slice(at)"] },
  ],
});
