import { definePlugin } from "@oxlint/plugins";
import noComments from "./rules/no-comments.mjs";
import noEffectExpressionBody from "./rules/no-effect-expression-body.mjs";
import noMultiRowInsert from "./rules/no-multi-row-insert.mjs";
import noResponseOwners from "./rules/no-response-owners.mjs";
import noSqlLower from "./rules/no-sql-lower.mjs";

export default definePlugin({
  meta: { name: "holler" },
  rules: {
    "no-comments": noComments,
    "no-effect-expression-body": noEffectExpressionBody,
    "no-multi-row-insert": noMultiRowInsert,
    "no-response-owners": noResponseOwners,
    "no-sql-lower": noSqlLower,
  },
});
