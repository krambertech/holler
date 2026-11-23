# Holler: working agreements

Holler asks a team something in Slack, reminds the people who have not answered, and shows the results. Read [`CONTEXT.md`](CONTEXT.md) before naming anything: it is the authority on the domain words and lists the words to avoid. A Holler is never a "survey" in general, a recipient is never a "respondent" before they answer, and "Holler" is never a verb.

## The repo

[`README.md`](README.md) has the layout and the commands. [`docs/stack.md`](docs/stack.md) has every technical decision with the alternative that lost; read it before proposing a different shape. [`PRODUCT.md`](PRODUCT.md) is who Holler is for. [`DESIGN.md`](DESIGN.md) holds the rules every screen follows. [`docs/data-model.md`](docs/data-model.md) explains the schema and its rules. [`docs/slack.md`](docs/slack.md) is the design of every Slack surface. [`DECISIONS.md`](DECISIONS.md) records the brand decisions and what is still open. [`docs/operations.md`](docs/operations.md) is where Holler runs, how it deploys and how previews work. [`docs/work-areas.md`](docs/work-areas.md) says which area owns which files while several sessions build in parallel. [`docs/adr/`](docs/adr/README.md) holds one record per decision that is hard to reverse; write one when a choice would surprise the next reader.

Two deployables: `apps/site` is the Astro public site at `holler.team`; `apps/web` is the Vite React product and Hono Worker at `app.holler.team`, which also serves the API, the Slack endpoints and the MCP server. `packages/core` is what the product's client and server both import: the Drizzle schema, Zod types for every payload, plan limits, the results maths and the reminder rhythm. `packages/design` holds the tokens, the logo geometry and the contrast pairs.

## Testing locally

Copy `apps/web/.dev.vars.example` to `apps/web/.dev.vars`, add `DEV_ROUTES=true`, and run `pnpm db:migrate`. Start the product with the `holler` entry in `.claude/launch.json` (port 5280). Sign in by navigating to `/api/dev/sign-in?as=lead` (or `sender` for the empty states); never type a Slack password. Every component, in day and night, is on the design site (`pnpm --filter @holler/web design:dev`, the `holler-design` entry in `.claude/launch.json`, port 5282); a new component gets an entry in `apps/web/src/client/design/parts/` or `pnpm check:design-coverage` fails. [`docs/testing.md`](docs/testing.md) has what each gate proves.

Holler needs Node 24 (`.nvmrc`).

## Before you push

```bash
pnpm verify
```

It runs formatting, lint, the design, styling and migration checks, typechecking, every test, both builds and the bundle boundary check. A bug fix ships with a check that fails for its whole class, and a guard that proves it (Guards, below). `pnpm fix` writes oxfmt's formatting and Oxlint's fixes. For a change a person sees, also run `pnpm test:e2e` and prove it with the [`verify`](.agents/skills/verify/SKILL.md) skill: it drives each feature the diff reaches at 1280 px and 375 px, in day and night, and keeps the evidence. A product change is not done until it has been driven.

Open pull requests with the [`open-pr`](.agents/skills/open-pr/SKILL.md) skill and the [template](.github/pull_request_template.md). For branches, commit messages, pull request titles and merging, follow [`docs/git-workflow.md`](docs/git-workflow.md).

Project skills live in `.agents/skills/`; `.claude/skills` links to it so every agent reads the same files.

## Conventions

**Documentation.** Write each prose paragraph and each list item as a single source line. Let the editor wrap.

**Filenames.** Files under `apps/web/src/client` are kebab-case: `HollerRow` lives in `holler-row.tsx`. Oxlint enforces it everywhere except `routes/`, where TanStack Router needs `$param` names.

**Comments.** Source files carry no comments ([ADR 0002](docs/adr/0002-source-files-carry-no-comments.md)). Say a reason in a name, a type, a test or a check; record a decision or an outside constraint in the doc that owns the code or in an ADR, and name the code from there. Tool directives stay: `oxlint-disable-next-line rule -- reason`, `@ts-expect-error`, `/// <reference>`, `/** @type {…} */` and `check-styling: allow`. Older files keep the comment lines `scripts/comment-baseline.json` allows, a new file keeps none, and a count only falls. After deleting comments, run `pnpm check:comments --update`. The [`delete-comment`](.agents/skills/delete-comment/SKILL.md) skill works through the rest.

**Types.** `interface Props` for component props, `type` for unions and small shapes. Zod schemas in `packages/core/src/types.ts` are the source of truth for every API payload: the route parses with one, and the TypeScript type is inferred from it, never hand-written beside it.

**Styling.** Tailwind v4 utilities over the Holler tokens: `bg-plate`, `text-ink-2`, `bg-tint text-tint-ink`. Token values live in `packages/design/tokens.css`; DESIGN.md's colours are generated from it. A raw hex or a stock Tailwind colour in a component is a bug: dark mode is its own palette, not an inversion. Use logical directions (`ms-`, `pe-`, `text-start`). One plum button per screen.

**Component APIs.** One shape for every component, Holler's own and the primitives alike. `interface Props extends ComponentProps<…>`, spread the rest, set `data-slot`, export once at the bottom. Optional props are written `?: T | undefined`. Render as another element with `render`, never a class-string helper: `<Button render={<Link to="/" />}>`. `variant` is the visual treatment, `tone` is the meaning (`neutral`, `live`, `warning`, `danger`), `size` takes tokens (`sm`, `md`, …), never pixels. `aria-label` names a thing for screen readers; `label` is only ever visible text. Secondary text is `description`; in-flight is `pending`; icons are passed as `ReactNode` children. Hover uses the `hoverable:` variant so it never sticks on touch, hairlines use the `edge` utilities so forced-colours mode keeps them, and every control keeps a 44 px hit area on touch.

**Interface text.** Plain, warm, brief, in sentence case, with no exclamation marks and no emoji. Say what happens: "7 of 12 answered". Never build a sentence from fragments or from a ternary on `=== 1`; write both sentences. Dates and numbers go through `Intl`.

**Server layering.** `routes/*` parse input with a core schema, call one service and return. `services/*` hold the logic and own the database; each function takes a `ServiceContext` (db, workspace, actor, clock). Routes, Slack handlers and MCP tools never import Drizzle; Oxlint refuses it. Every write records Activity through `services/audit.ts` in the same batch. A rule kept in one door (web, Slack, API, MCP) is kept in all of them because they call the same service.

**Errors.** A service throws `ServiceError` with a code and a message written for the person who reads it, saying what to do next, and a `field` when one input is at fault.

**Slack.** Every Slack call goes through `SlackClient` (`apps/web/src/server/slack/client.ts`); tests use `FakeSlack`. Every `/slack/*` request is checked with `verifySlackRequest` before its body is read. Bot tokens are stored only encrypted.

**D1.** At most 100 bound values per statement: insert one row per statement inside a batch. SQLite's `lower()` is ASCII-only: fold in JavaScript and store a `search_*` column.

## Guards

Every rule a check enforces is one file in [`guards/`](guards/): the rule, the past mistake it stops, the check, and the edit that brings the mistake back. `pnpm guards` lists them all. CI makes each edit in a scratch copy and fails when the check still passes, so a check that stops working is found before it is trusted ([ADR 0004](docs/adr/0004-every-rule-proves-it-can-fail.md)).

A bug fix ships with a guard for its whole class, at the first of these that can hold it:

1. **Architecture.** Reshape the code so the mistake cannot be written.
2. **Types.** Make it a type error.
3. **Lint.** A rule in `oxlint-plugin-holler/rules/` whose message names the fix.
4. **Test.** Real D1, real services, a fake only for Slack and the queue.

Write `guards/<rule>.json` beside the fix and run `pnpm guards:prove <rule>`. When `pnpm check` says a guard's code moved, rewrite its `break` as the edit that would bring the mistake back today. Delete a guard only when its mistake can no longer be written, and say so in the pull request.
| Rule                                                                        | Check                                                |
| --------------------------------------------------------------------------- | ---------------------------------------------------- |
| Only services touch Drizzle                                                 | Oxlint `no-restricted-imports` on routes, Slack and MCP |
| No `lower()` in server SQL                                                  | `holler/no-sql-lower` in `oxlint-plugin-holler`      |
| New lines use Holler tokens and logical directions                          | `pnpm check:styling`                                 |
| DESIGN.md's colours match `tokens.css`, and every component it names exists | `pnpm check:design`                                  |
| Every text pair meets WCAG AA in both themes                                | `packages/design/src/contrast.test.ts`               |
| A new source file has no comments, and an older one never gains any | `holler/no-comments` and `pnpm check:comments` against `scripts/comment-baseline.json` |
| Every lint suppression still suppresses something | `oxlint --report-unused-disable-directives-severity error` in `pnpm check` |
| Applied migrations never change                                             | `pnpm check:migrations`                              |
| No dev tools in the production bundle                                       | `pnpm check:boundaries`                              |
| Every exported component has an entry on the design site | `pnpm check:design-coverage` |
| Files under `apps/web/src/client` are kebab-case                            | Oxlint `unicorn/filename-case`                       |
| Every journey page passes axe at WCAG 2.2 AA                                | `e2e/`                                               |
| No journey page logs a console error, throws, or gets a 5xx | `e2e/fixtures.ts`, which every spec imports by the Oxlint `no-restricted-imports` rule on `e2e/` |
| Concurrent first dev sign-ins all succeed and seed once                    | `apps/web/src/server/routes/dev-concurrency.test.ts` |
| Every e2e sign-in lands where the test goes next, so no redirect races its navigation | `holler/sign-in-lands` in `oxlint-plugin-holler`; `signInAs` in `e2e/a11y.ts` |
| The product navigates only to routes that exist | `holler/typed-navigation` in `oxlint-plugin-holler` refuses `href` in `navigate` and `redirect`, so the router's types check every `to` |
| Send reminder wakes up when the wait between reminders ends, without a reload | `useWakeAt` in `lib/use-wake-at.ts`; `e2e/holler-page.spec.ts` runs the clock past the wait |
| e2e tests never leave rows that another test finds by name | Each spec mocks a write whose result other specs could see; `e2e/holler-page.spec.ts` mocks the copy |
| Pull request titles follow `type(scope): summary` within 72 characters      | `scripts/check-pr-title.mjs` in CI                   |
| Server inserts one row per statement, inside D1's 100-value limit | `holler/no-multi-row-insert` in `oxlint-plugin-holler` |
| A lookup by a list of ids stays inside D1's 100-value limit however long the list grows | `holler/bounded-in-array` in `oxlint-plugin-holler`; `readInChunks` in `server/batch.ts`, which also reads a repeated id once; `services/hollers.test.ts` lists 101 Hollers and previews 100 groups and a repeated one |
| No read spreads its rows into a call's arguments, so a large read never overflows the argument limit | `holler/no-spread-rows` in `oxlint-plugin-holler`; `server/batch.test.ts` reads 300,000 rows |
| Every Slack message and view fits Block Kit's limits | `FakeSlack` refuses what Slack would; `slack/blocks/messages.test.ts` sends the largest Holler |
| Work claimed for the queue is given back when the queue refuses it | `queueClaimed`; `services/delivery.test.ts`, "no claimed work is lost" |
| A send, close, reminder or answer happens once when callers race | `services/delivery.test.ts`, "exactly once under concurrency" |
| Every queued send that posts to Slack posts once, however often it arrives | `sendEffects` and `postKey` in `services/delivery.ts`; `services/delivery.test.ts`, "every send that posts, posts once" |
| One cron step failing never stops another | `runSteps`; `cron.test.ts` |
| Reminders land in working hours, clear of the close, in every zone | `packages/core/src/reminders.test.ts` sweep |
| The dev seed leaves room to send on every day of a month | `services/dev-seed.test.ts` |
| Server tests pass in any order | `sequence.shuffle` with a fixed seed in `apps/web/vitest.config.ts` |
| Every modal element reads back into an answer `recordResponse` takes | `services/answering.test.ts` fills each element by type |
| No cell of a CSV export runs as a formula, whatever anyone typed | `csvCell`; `services/exports.test.ts` writes every formula start into every field |
| Anonymous results and exports keep no trace of answer order | `packages/core/src/results.test.ts` shuffles every answer; `services/exports.test.ts` |
| The web form and `recordResponse` refuse the same answers in the same words | `answerProblem` in `packages/core/src/answers.ts`; `services/respond.test.ts` |
| The web form shows a follow-up for exactly the answers the server keeps a note for | `noteAsked`; `services/respond.test.ts`, "shows a follow-up for exactly the answers" |
| No effect returns a value that is not its cleanup | `holler/no-effect-expression-body` in `oxlint-plugin-holler` |
| The web form searches the directory only while the people picker is open, and makes no failed call | `e2e/respond.spec.ts`, "a recipient answers every question type" |
| An answer kept while the queue refused still reaches the DM when the person sends again | `services/respond.test.ts`, "puts the DM right when the answers were kept but the queue refused" |
| Every illustration fills the grid, has one subject and at most one accent, and tilts no object past 12 degrees | `packages/design/src/illustrations.test.ts` |
| Only Your answers reads who gave an anonymous response | `holler/no-response-owners` in `oxlint-plugin-holler`; `services/own-answers.test.ts`, "never reaches results or exports" |
| Every round of a repeating pulse lands on the first round's day and time, in every zone, for a year | `packages/core/src/repeats.test.ts` sweep |
| A round that goes out schedules exactly one next round, never in the past | `services/rounds.test.ts` |
| Every Holler column is either copied to the next round or set for each round | `roundColumns` in `services/rounds.ts` (typecheck); `services/rounds.test.ts` |
| Every round of a repeating pulse closes before anyone gets the next, across clock changes and late sends | `goLive` caps `closesAt` at the next round's first invite; `services/rounds.test.ts` |
| Once Stop repeating returns, no further round goes out, whichever write lands first | `unlessStillRepeating` in `services/rounds.ts`; `services/rounds.test.ts`, both race cases |

## Generated files

Edit the source and rerun the generator; never edit these by hand. `apps/web/migrations/**` and `scripts/migration-manifest.json`: `pnpm db:generate`, then `node scripts/check-migrations.mjs --write`. `packages/core/src/schema/auth.ts`: `pnpm --filter @holler/web auth:schema` after a Better Auth config change. `apps/*/worker-configuration.d.ts`: that app's `cf-typegen` after a Wrangler binding change. `apps/web/src/client/routeTree.gen.ts`: the Vite dev server or build rewrites it. DESIGN.md's colours: `node scripts/check-design.mjs --write` after changing `packages/design/tokens.css`.

## Leave alone

Merging to `main` deploys to production; [`docs/operations.md`](docs/operations.md) has how. Deploying by hand (`pnpm deploy`, `wrangler deploy`), remote D1 commands, Wrangler secrets, pushing to `main` and merging pull requests are Kateryna's; `.claude/settings.json` denies them. Ask, and hand over the exact command. `apps/*/.dev.vars` holds real secrets and stays git-ignored.

## Licence

The repository is public to read and is not open source. [`LICENSE`](LICENSE) reserves every right. Do not add code copied from a project whose licence would require Holler to open its own.
