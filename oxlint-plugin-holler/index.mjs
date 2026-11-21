import { definePlugin } from "@oxlint/plugins";
import noComments from "./rules/no-comments.mjs";
import noEffectExpressionBody from "./rules/no-effect-expression-body.mjs";
import noMultiRowInsert from "./rules/no-multi-row-insert.mjs";
import noSqlLower from "./rules/no-sql-lower.mjs";

export default definePlugin({
  meta: { name: "holler" },
  rules: {
    "no-comments": noComments,
    "no-effect-expression-body": noEffectExpressionBody,
    "no-multi-row-insert": noMultiRowInsert,
    "no-sql-lower": noSqlLower,
  },
});
