# Work areas

Seven areas are built in parallel, each in its own session, branch and pull request, on top of the foundations. This page says what each area owns, which files it may change, and the contracts between areas, so two sessions never rewrite the same file. When an area is done, delete its section.

## Rules for every area

- Read [AGENTS.md](../AGENTS.md) first, then the docs it points to. Use the words in [CONTEXT.md](../CONTEXT.md).
- Stay inside your files. A shared file (listed below) gets small, additive edits only: one import and one `app.route` line in `app.ts`, one binding in `wrangler.jsonc`.
- **Schema changes.** Add columns or tables in a new file under `packages/core/src/schema` where you can. Before you generate a migration, rebase on `origin/main`; generate with `pnpm db:generate`, record it with `node scripts/check-migrations.mjs --write`. If `main` gained a migration while your pull request was open, delete yours, rebase, and generate again.
- Every behaviour has a service test. Every screen has a Playwright journey that ends with `expectAccessible(page)`. Every screen is checked by eye at 1280 px and 375 px, in day and night.
- `pnpm verify` passes before you open the pull request.

## Contracts between areas

| Contract                                                                                                           | Owner                                        | Used by                              |
| ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- | ------------------------------------ |
| `POST /api/hollers/:id/send` → the Holler, or `400` with every problem from `sendProblems`, or `402 limit_reached` | Slack delivery                               | Editor, API and MCP                  |
| `POST /api/hollers/:id/close`, `POST /api/hollers/:id/remind`                                                      | Slack delivery                               | Results, API and MCP                 |
| `sendHoller(ctx, env, id)`, `closeHoller(ctx, env, id)`, `remindWaiting(ctx, env, id)` in `services/delivery.ts`   | Slack delivery                               | Every door                           |
| `GET /api/directory?q=` people and groups (exists)                                                                 | Foundations; kept fresh by Slack install     | Editor                               |
| `slackFor(env, db, workspaceId)` (exists)                                                                          | Foundations; tokens written by Slack install | Slack delivery                       |
| `recordResponse`, `resultsFor` (exist)                                                                             | Foundations                                  | Slack delivery, Results, API and MCP |
| `GET /api/hollers/:id/export?format=csv\|md`, `exportCsv`, `exportMarkdown` in `services/exports.ts`               | Results                                      | API and MCP                          |
| `workspaces.plan` changes only through `services/billing.ts`                                                       | Billing                                      | Everyone reads `monthlyUsage`        |

Until a contract's owner merges, build against its shape and stub it in tests.

## 1. Slack install and sign-in

Make a real Slack workspace able to install Holler and its people able to sign in.

- "Add to Slack" OAuth (`/slack/oauth/install`, `/slack/oauth/callback`): store the bot in `slack_installations` with `encryptToken`, create or update the `workspaces` row, make the installer an owner.
- Sign in with Slack through Better Auth: on first sign-in, link the user to the workspace in the ID token's team claim and create their `members` row. A person whose workspace has not installed Holler sees how to install it.
- Directory sync: fill `slack_people` and `slack_groups` from `users.list`, `usergroups.list` and channels, on install, daily from the cron, and on `user_change` and `team_join` events.
- `/slack/events` with signature checks: `app_uninstalled` and `tokens_revoked` set `workspaces.uninstalled_at`.
- Settings page: the workspace, its members and their roles, reinstall.

Owns: `src/server/slack/oauth.ts`, `src/server/slack/events.ts`, `src/server/services/workspaces.ts`, `src/server/services/members.ts`, `src/server/services/directory-sync.ts`, `src/client/routes/_app/settings*.tsx`, `src/client/routes/install*.tsx`. Shares: `auth.ts` (hooks), `app.ts`, `index.ts` (one cron line).

## 2. Slack delivery, answering and reminders

Everything that sends and everything a recipient does. The design is [slack.md](slack.md).

- `services/delivery.ts`: `sendHoller` (check `sendProblems` and `assertCanSend`, resolve the audience into `recipients`, set `sent_at` and `closes_at`, enqueue), `closeHoller`, `remindWaiting`.
- The `SLACK_SENDS` queue consumer (add it to `wrangler.jsonc`) with retries, backoff and `Retry-After`.
- Block Kit builders for every message in slack.md, as pure functions with snapshot tests.
- `/slack/interactions`: one-tap answers, the answer modal, I submitted it, Remind me later.
- Cron passes: scheduled sends, sends in each recipient's time zone, reminders (from `nextReminder`), close notices.
- The channel announcement with its live count.
- `/respond/$id`: the web form for hollers too big for a modal, reached by a signed link.
- App Home for senders and recipients, and `/holler`.

Owns: `src/server/slack/blocks/**`, `src/server/slack/interactions.ts`, `src/server/slack/queue.ts`, `src/server/slack/commands.ts`, `src/server/slack/home.ts`, `src/server/services/delivery.ts`, `src/server/services/reminders.ts`, `src/client/routes/respond*.tsx`. Shares: `routes/hollers.ts` (send, close, remind routes), `index.ts`, `wrangler.jsonc`.

## 3. The editor

Writing a Holler in about two minutes: `/new` and editing a draft.

- Pick the mode first, then title and description, then questions (templates, options, reorder, required), then the audience (people, groups, everyone, from `/api/directory`), then when it sends and closes, anonymity, the announcement channel, tags.
- Autosave as the sender types, through `PUT /api/hollers/:id`. Show every send problem beside its field at once.
- **Send** and **Schedule** call the send contract above. The limit message from `402` links to billing.

Owns: `src/client/routes/_app/new.tsx`, `src/client/routes/_app/hollers.$id.edit.tsx`, `src/client/components/editor/**`, new primitives it needs in `src/client/components/ui/` (input, textarea, switch, select, combobox, date-time picker, each on the design page).

## 4. Results, sharing and exports

The detail page at `/hollers/$id`: who answered, the results, and getting them out.

- People: answered and waiting, with avatars, and **Send reminder** (the contract above).
- Results per question: bars on the chart ramp, scale averages, text answers, who picked what on a named Holler.
- Sharing: visibility (Just me, Everyone in the workspace), viewers, the report link at `/report/$token`.
- Exports: CSV with formula-injection guards, Markdown, Copy as Markdown.
- Close now, duplicate, delete a draft.

Owns: `src/client/routes/_app/hollers.$id.tsx`, `src/client/routes/report.$token.tsx`, `src/client/components/results/**`, `src/server/services/exports.ts`, `src/server/services/sharing.ts`, `src/server/routes/exports.ts`, `src/server/routes/report.ts`.

## 5. API and MCP

The same product through two more doors.

- REST under `/api/v1`, described with `hono-openapi` from the core schemas, served at `/api/openapi.json`. API keys from Better Auth's `apiKey` plugin, made and revoked in Settings, `read` or `write`. `Idempotency-Key` on create.
- `/mcp`: a stateless MCP server whose tools call the same services: list, get, create, send, close hollers; read results; remind; export. OAuth through the Better Auth MCP plugin, with a consent page.
- Principal resolution for keys and tokens in `principal.ts`, with `via: "api"` or `"mcp"`.
- Connected apps in Settings: what each can do, and revoke.

Owns: `src/server/routes/v1/**`, `src/server/mcp/**`, `src/server/openapi.ts`, `src/client/routes/consent.tsx`, `src/client/routes/_app/settings.api.tsx`. Shares: `principal.ts`, `auth.ts`.

## 6. Billing

Free sends a few hollers a month; Team pays per workspace through Polar.

- `@polar-sh/better-auth`: checkout, the customer portal, webhooks. The Polar customer is the workspace, not the person.
- `services/billing.ts` is the only writer of `workspaces.plan`, `polar_*` and `plan_ends_at`, from verified webhooks.
- The plan and this month's usage in Settings; the limit reached state everywhere a send can fail.
- Prices in Polar; the Free number stays in `packages/core/src/plans.ts`.

Owns: `src/server/services/billing.ts`, `src/server/routes/billing.ts`, `src/client/routes/_app/settings.billing.tsx`, `src/client/components/billing/**`. Shares: `auth.ts` (one plugin).

## 7. Marketing site

A slim site at `holler.team`: the landing page, pricing, the API and MCP docs, privacy, terms and security, a changelog. Use the brand register in the `impeccable` skill and DESIGN.md. Fast, static, no client JavaScript unless a section needs it.

Owns: everything in `apps/site`.
