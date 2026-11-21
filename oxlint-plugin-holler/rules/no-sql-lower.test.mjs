import { testRule } from "../test/run.mjs";

const filename = "hollers.ts";

testRule("no-sql-lower", {
  message:
    "SQLite's lower() folds ASCII only, so Дієслова and дієслова stay different on D1. Fold in " +
    "JavaScript with toLocaleLowerCase() and bind the result, or store a normalised column.",
  valid: [
    { filename, code: "const a = sql`SELECT * FROM hollers WHERE title = ?`;" },
    { filename, code: "const b = sql`SELECT lower(hex(id)) FROM hollers`;" },
    { filename, code: "const c = sql`SELECT flower(title) FROM hollers`;" },
    { filename, code: "const d = db.sql`SELECT lower(title) FROM hollers`;" },
  ],
  invalid: [
    {
      filename,
      code: "const a = sql`SELECT * FROM hollers WHERE lower(title) = ?`;",
      errors: ["sql`SELECT * FROM hollers WHERE lower(title) = ?`"],
    },
    {
      filename,
      code: "const b = SQL`select LOWER( title) from hollers`;",
      errors: ["SQL`select LOWER( title) from hollers`"],
    },
    {
      filename,
      code: "const c = sql`select lower(${column})`;",
      errors: ["sql`select lower(${column})`"],
    },
    {
      filename,
      code: "const d = sql`\n  SELECT id\n  FROM hollers\n  WHERE lower(title) = ?\n`;",
      errors: ["sql`\n  SELECT id\n  FROM hollers\n  WHERE lower(title) = ?\n`"],
    },
  ],
});
