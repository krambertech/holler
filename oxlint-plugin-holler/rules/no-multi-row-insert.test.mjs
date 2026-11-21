import { testRule } from "../test/run.mjs";

const filename = "delivery.ts";

testRule("no-multi-row-insert", {
  message:
    "D1 binds at most 100 values in one statement, so a multi-row insert fails once the list " +
    "grows. Insert one row per statement and run them with runBatch, in chunks of 100.",
  valid: [
    { filename, code: "db.insert(t).values({ id: 1 });" },
    { filename, code: "rows.map((row) => db.insert(t).values({ id: row }));" },
    { filename, code: "db.insert(t).values(row);" },
    { filename, code: "Object.values(rows);" },
  ],
  invalid: [
    {
      filename,
      code: "db.insert(t).values([{ id: 1 }, { id: 2 }]);",
      errors: ["[{ id: 1 }, { id: 2 }]"],
    },
    {
      filename,
      code: "db.insert(t).values(rows.map((row) => ({ id: row })));",
      errors: ["rows.map((row) => ({ id: row }))"],
    },
    {
      filename,
      code: "db.insert(t).values(groups.flatMap((g) => g.rows));",
      errors: ["groups.flatMap((g) => g.rows)"],
    },
  ],
});
