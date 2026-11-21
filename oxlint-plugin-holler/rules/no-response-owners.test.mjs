import { testRule } from "../test/run.mjs";

const filename = "results.ts";

testRule("no-response-owners", {
  message:
    "response_owners links an anonymous response to its person. Only the person's own answers " +
    "(services/own-answers.ts) read it, and only recordResponse and the dev seed write it, so results, exports, " +
    "the API, MCP and Slack can never say who gave an anonymous answer. docs/adr/0003.",
  valid: [
    { filename, code: "const rows = db.select().from(schema.responses);" },
    { filename, code: "const owners = 'response owners';" },
    { filename, code: "const { responses, answers } = schema;" },
  ],
  invalid: [
    {
      filename,
      code: "const rows = db.select().from(schema.responseOwners);",
      errors: ["responseOwners"],
    },
    {
      filename,
      code: "const { responseOwners } = schema;",
      errors: ["responseOwners"],
    },
    {
      filename,
      code: "const rows = db.run('select * from response_owners');",
      errors: ["'select * from response_owners'"],
    },
    {
      filename,
      code: "const rows = sql`select slack_user_id from response_owners`;",
      errors: ["`select slack_user_id from response_owners`"],
    },
  ],
});
