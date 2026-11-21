---
status: accepted
date: 2026-11-21
---

# Anonymous answers stay privately linked to their person

An anonymous Holler's responses are kept linked to the person who gave them, in a table of their own, `response_owners`, so each person can read their own answers on Your answers (`/answers`). Nobody else can: the sender, viewers, the report link, exports, the API, MCP and Slack all read results through paths that never touch that table, and an Oxlint rule refuses any other code that names it. Anonymous now means hidden from everyone but the person, not unknown to Holler.

## Context

Kateryna asked that every person can see every response they gave, across every Holler they answered. Until now an anonymous response stored no Slack user id at all: `responses.slack_user_id` was null and the times were rounded to the hour, so not even Holler could say which response was whose. That made an anonymous person's own answers impossible to show back to them. She chose, on 21 November 2026, to keep a private link rather than leave anonymous answers out of the history.

## Considered options

- **Link privately, in its own table:** accepted. The link lives in `response_owners (response_id, holler_id, slack_user_id)`, written in the same batch as the response by `recordResponse`, with a unique index on `(holler_id, slack_user_id)` that backs up one response per person. `responses.slack_user_id` stays null and the hour rounding stays, so every reader of `responses` and `answers` sees exactly what it saw before.
- **Put the person on `responses.slack_user_id` for anonymous hollers too:** rejected. Every reader of that column (results, exports, the API, the Slack thank-you, the dev state) would need a new anonymity check, and one missed check would name people.
- **Keep anonymous answers unlinked and leave them out of the history:** rejected by Kateryna. The history would show "answered anonymously" with nothing behind it.
- **Keep a copy only in the person's Slack DM:** rejected by Kateryna. Holler's database would hold no link, but workspace admins who export DMs could read the copy, and the copy is lost when the DM is.

## Consequences

- `holler/no-response-owners` in `oxlint-plugin-holler` refuses the name `responseOwners` and the table name `response_owners` everywhere in `apps/web/src` and `packages/core/src`, except the schema, `services/own-answers.ts` (the only reader), `services/responses.ts` (`recordResponse`, the writer), `services/dev-seed.ts` and tests.
- `services/own-answers.test.ts` checks that results, the CSV export and the Markdown export of an anonymous Holler are byte for byte the same with and without the links, and name nobody who answered.
- Holler now knows who gave each anonymous answer. Anyone with direct access to the production database (Kateryna, through Wrangler) could join the two tables. The promise to the people answering is that no one in their workspace can, which is what the interface says.
- Anonymous responses given before this change have no link. Their person sees that they answered, and that Holler has no copy of those answers.
- Copy that describes anonymous to a sender or a recipient says the sender never sees who answered what, and never says Holler cannot know.
