# Holler: working agreements

Holler asks a team something in Slack, reminds the people who have not answered, and shows the results. Read [`CONTEXT.md`](CONTEXT.md) before naming anything: it is the authority on the domain words and lists the words to avoid. A Holler is never a "survey" in general, a recipient is never a "respondent" before they answer, and "Holler" is never a verb.

## The repo

[`README.md`](README.md) has the layout and the commands. [`docs/stack.md`](docs/stack.md) has every technical decision with the alternative that lost; read it before proposing a different shape. [`PRODUCT.md`](PRODUCT.md) is who Holler is for. [`DESIGN.md`](DESIGN.md) holds the rules every screen follows. [`docs/data-model.md`](docs/data-model.md) explains the schema and its rules. [`docs/slack.md`](docs/slack.md) is the design of every Slack surface. [`DECISIONS.md`](DECISIONS.md) records the brand decisions and what is still open. [`docs/operations.md`](docs/operations.md) is where Holler runs, how it deploys and how previews work. [`docs/work-areas.md`](docs/work-areas.md) says which area owns which files while several sessions build in parallel.

Two deployables: `apps/site` is the Astro public site at `holler.team`; `apps/web` is the Vite React product and Hono Worker at `app.holler.team`, which also serves the API, the Slack endpoints and the MCP server. `packages/core` is what the product's client and server both import: the Drizzle schema, Zod types for every payload, plan limits, the results maths and the reminder rhythm. `packages/design` holds the tokens, the logo geometry and the contrast pairs.

## Testing locally

Copy `apps/web/.dev.vars.example` to `apps/web/.dev.vars`, add `DEV_ROUTES=true`, and run `pnpm db:migrate`. Start the product with the `holler` entry in `.claude/launch.json` (port 5280). Sign in by navigating to `/api/dev/sign-in?as=lead` (or `sender` for the empty states); never type a Slack password. Every component, in day and night, is on the design site (`pnpm --filter @holler/web design:dev`, the `holler-design` entry in `.claude/launch.json`, port 5282); a new component gets an entry in `apps/web/src/client/design/parts/` or `pnpm check:design-coverage` fails. [`docs/testing.md`](docs/testing.md) has what each gate proves.

Holler needs Node 24 (`.nvmrc`).

## Before you push

```bash
pnpm verify
```

It runs formatting, lint, the design, styling and migration checks, typechecking, every test, both builds and the bundle boundary check. `pnpm fix` writes Biome's fixes. For a change a person sees, also run `pnpm test:e2e` and prove it with the [`verify`](.agents/skills/verify/SKILL.md) skill: it drives each feature the diff reaches at 1280 px and 375 px, in day and night, and keeps the evidence. A product change is not done until it has been driven.

Open pull requests with the [`open-pr`](.agents/skills/open-pr/SKILL.md) skill and the [template](.github/pull_request_template.md). For branches, commit messages, pull request titles and merging, follow [`docs/git-workflow.md`](docs/git-workflow.md).

Project skills live in `.agents/skills/`; `.claude/skills` links to it so every agent reads the same files.

## Conventions

**Documentation.** Write each prose paragraph and each list item as a single source line. Let the editor wrap.

**Filenames.** Files under `apps/web/src/client` are kebab-case: `HollerRow` lives in `holler-row.tsx`. Biome enforces it everywhere except `routes/`, where TanStack Router needs `$param` names.

**Types.** `interface Props` for component props, `type` for unions and small shapes. Zod schemas in `packages/core/src/types.ts` are the source of truth for every API payload: the route parses with one, and the TypeScript type is inferred from it, never hand-written beside it.

**Styling.** Tailwind v4 utilities over the Holler tokens: `bg-plate`, `text-ink-2`, `bg-tint text-tint-ink`. Token values live in `packages/design/tokens.css`; DESIGN.md's colours are generated from it. A raw hex or a stock Tailwind colour in a component is a bug: dark mode is its own palette, not an inversion. Use logical directions (`ms-`, `pe-`, `text-start`). One plum button per screen.

**Component APIs.** One shape for every component, Holler's own and the primitives alike. `interface Props extends ComponentProps<…>`, spread the rest, set `data-slot`, export once at the bottom. Optional props are written `?: T | undefined`. Render as another element with `render`, never a class-string helper: `<Button render={<Link to="/" />}>`. `variant` is the visual treatment, `tone` is the meaning (`neutral`, `live`, `warning`, `danger`), `size` takes tokens (`sm`, `md`, …), never pixels. `aria-label` names a thing for screen readers; `label` is only ever visible text. Secondary text is `description`; in-flight is `pending`; icons are passed as `ReactNode` children. Hover uses the `hoverable:` variant so it never sticks on touch, hairlines use the `edge` utilities so forced-colours mode keeps them, and every control keeps a 44 px hit area on touch.

**Interface text.** Plain, warm, brief, in sentence case, with no exclamation marks and no emoji. Say what happens: "7 of 12 answered". Never build a sentence from fragments or from a ternary on `=== 1`; write both sentences. Dates and numbers go through `Intl`.

**Server layering.** `routes/*` parse input with a core schema, call one service and return. `services/*` hold the logic and own the database; each function takes a `ServiceContext` (db, workspace, actor, clock). Routes, Slack handlers and MCP tools never import Drizzle; Biome refuses it. Every write records Activity through `services/audit.ts` in the same batch. A rule kept in one door (web, Slack, API, MCP) is kept in all of them because they call the same service.

**Errors.** A service throws `ServiceError` with a code and a message written for the person who reads it, saying what to do next, and a `field` when one input is at fault.

**Slack.** Every Slack call goes through `SlackClient` (`apps/web/src/server/slack/client.ts`); tests use `FakeSlack`. Every `/slack/*` request is checked with `verifySlackRequest` before its body is read. Bot tokens are stored only encrypted.

**D1.** At most 100 bound values per statement: insert one row per statement inside a batch. SQLite's `lower()` is ASCII-only: fold in JavaScript and store a `search_*` column.

## Enforced rules

| Rule                                                                        | Check                                                |
| --------------------------------------------------------------------------- | ---------------------------------------------------- |
| Only services touch Drizzle                                                 | Biome `noRestrictedImports` on routes, Slack and MCP |
| No `lower()` in server SQL                                                  | `biome-plugins/no-sql-lower.grit`                    |
| New lines use Holler tokens and logical directions                          | `pnpm check:styling`                                 |
| DESIGN.md's colours match `tokens.css`, and every component it names exists | `pnpm check:design`                                  |
| Every text pair meets WCAG AA in both themes                                | `packages/design/src/contrast.test.ts`               |
| Applied migrations never change                                             | `pnpm check:migrations`                              |
| No dev tools in the production bundle                                       | `pnpm check:boundaries`                              |
| Every exported component has an entry on the design site | `pnpm check:design-coverage` |
| Files under `apps/web/src/client` are kebab-case                            | Biome `useFilenamingConvention`                      |
| Every journey page passes axe at WCAG 2.2 AA                                | `e2e/`                                               |
| Concurrent first dev sign-ins all succeed and seed once                    | `apps/web/src/server/routes/dev-concurrency.test.ts` |
| Pull request titles follow `type(scope): summary` within 72 characters      | `scripts/check-pr-title.mjs` in CI                   |

## Generated files

Edit the source and rerun the generator; never edit these by hand. `apps/web/migrations/**` and `scripts/migration-manifest.json`: `pnpm db:generate`, then `node scripts/check-migrations.mjs --write`. `packages/core/src/schema/auth.ts`: `pnpm --filter @holler/web auth:schema` after a Better Auth config change. `apps/*/worker-configuration.d.ts`: that app's `cf-typegen` after a Wrangler binding change. `apps/web/src/client/routeTree.gen.ts`: the Vite dev server or build rewrites it. DESIGN.md's colours: `node scripts/check-design.mjs --write` after changing `packages/design/tokens.css`.

## Leave alone

Merging to `main` deploys to production; [`docs/operations.md`](docs/operations.md) has how. Deploying by hand (`pnpm deploy`, `wrangler deploy`), remote D1 commands, Wrangler secrets, pushing to `main` and merging pull requests are Kateryna's; `.claude/settings.json` denies them. Ask, and hand over the exact command. `apps/*/.dev.vars` holds real secrets and stays git-ignored.

## Licence

The repository is public to read and is not open source. [`LICENSE`](LICENSE) reserves every right. Do not add code copied from a project whose licence would require Holler to open its own.
