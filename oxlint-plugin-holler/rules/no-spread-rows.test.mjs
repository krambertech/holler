import { testRule } from "../test/run.mjs";

const filename = "hollers.ts";

testRule("no-spread-rows", {
  message:
    "Spreading awaited rows into a call passes each row as an argument, and a large read overflows " +
    "the engine's argument limit. Use readInChunks from src/server/batch.ts, or push the rows in a loop.",
  valid: [
    { filename, code: "rows.push(...blocks);" },
    { filename, code: "const all = [...(await read())];" },
    { filename, code: "for (const row of await read()) rows.push(row);" },
    { filename, code: "rows.push(...sections(text));" },
  ],
  invalid: [
    {
      filename,
      code: "async function f() { rows.push(...(await db.select().from(t))); }",
      errors: ["...(await db.select().from(t))"],
    },
    {
      filename,
      code: "async function f() { rows.push(...await read()); }",
      errors: ["...await read()"],
    },
    {
      filename,
      code: "async function f() { Math.max(...(await read() as number[])); }",
      errors: ["...(await read() as number[])"],
    },
  ],
});
