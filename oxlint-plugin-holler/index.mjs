import { definePlugin } from "@oxlint/plugins";
import boundedInArray from "./rules/bounded-in-array.mjs";
import noComments from "./rules/no-comments.mjs";
import noMultiRowInsert from "./rules/no-multi-row-insert.mjs";
import noResponseOwners from "./rules/no-response-owners.mjs";
import noSpreadRows from "./rules/no-spread-rows.mjs";
import noSqlLower from "./rules/no-sql-lower.mjs";
import signInLands from "./rules/sign-in-lands.mjs";

export default definePlugin({
  meta: { name: "holler" },
  rules: {
    "bounded-in-array": boundedInArray,
    "no-comments": noComments,
    "no-multi-row-insert": noMultiRowInsert,
    "no-response-owners": noResponseOwners,
    "no-spread-rows": noSpreadRows,
    "no-sql-lower": noSqlLower,
    "sign-in-lands": signInLands,
  },
});
