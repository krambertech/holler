import { readdirSync } from "node:fs";
import { definePlugin } from "@oxlint/plugins";

const folder = new URL("./rules/", import.meta.url);
const files = readdirSync(folder)
  .filter((name) => name.endsWith(".mjs") && !name.endsWith(".test.mjs"))
  .sort();
const rules = await Promise.all(
  files.map(async (name) => [
    name.slice(0, -".mjs".length),
    (await import(new URL(name, folder).href)).default,
  ]),
);

export default definePlugin({ meta: { name: "holler" }, rules: Object.fromEntries(rules) });
