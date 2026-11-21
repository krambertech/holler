# Testing

Every rule Holler cares about fails a check instead of waiting for review. Run the whole gate before you push:

```bash
pnpm verify
```

## What runs

| Command                 | What it proves                                                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm check`            | oxfmt and Oxlint, with unused suppressions as errors, `check:design` (DESIGN.md matches the tokens, named components exist), `check:styling` (no raw colours, stock Tailwind colours or physical directions in new lines), `check:comments` (no file holds more comment lines than its baseline, and no baseline allows more than its file holds) |
| `pnpm check:migrations` | Drizzle's snapshot matches the schema, and no applied migration changed                                                                                                                    |
| `pnpm typecheck`        | Every package and both Workers, strict                                                                                                                                                     |
| `pnpm test`             | Vitest in every package, plus `node --test` for the repo scripts                                                                                                                           |
| `pnpm build`            | Both apps build                                                                                                                                                                            |
| `pnpm check:boundaries` | The production product bundle has no dev tools; the site has no product code                                                                                                               |
| `pnpm test:e2e`         | Playwright journeys in Chromium and WebKit, with axe on every page they visit                                                                                                              |

## Unit and service tests

- `packages/core`: pure rules. Results maths, the anonymous gate, the reminder rhythm, plan limits, the API schemas.
- `packages/design`: every text pair in `src/pairs.ts` meets its WCAG floor in both themes, and the OS dark block matches the `[data-theme="dark"]` block token for token.
- `apps/web/src/client` logic with no React, such as the editor's draft and send rules: in the server's Vitest run, which maps `@` to the client so these files import as the app does.
- `apps/web/src/server`: services against a real local D1 with every migration applied (`testDb()` in `test-db.ts`). Each file boots its own. Use `workspaceFixture()` for a workspace and a member, and `FakeSlack` instead of slack.com.

Anything that sends uses `deliveryEnv()` in `test-delivery.ts`: its queue refuses what Cloudflare Queues would (over 100 messages or 256 KB a batch), can refuse a kind of send or fail midway, and `drain(at)` runs the consumer by hand. Tests run shuffled, in the same order every run (`apps/web/vitest.config.ts`), so each test sets up what it reads: a file whose tests run the cron's passes calls `emptyDatabase()` before each test, because a pass reads every workspace, and a dev route test signs in with `reset=1`. Try another order with `--sequence.seed=<n>`. Fix the clock: pass a `now` to `workspaceFixture()`, and `vi.setSystemTime` for a route that reads it.

Test a service, not a route, unless the route itself has logic. A service test names the rule it proves: "refuses an option from another question", not "works".

**A bug gets a check for its class.** When a bug turns up, write the check that fails for every bug of its kind, not only this one: a rule in `oxlint-plugin-holler/rules/` with its test beside it, a limit a fake enforces, a sweep over every zone or day, or a concurrency or failure test across every door. Add a row to the Enforced rules table in `CLAUDE.md`.

## Browser journeys

`e2e/` runs the product and the site on their own ports with `HOLLER_E2E=1`, signs in through `/api/dev/sign-in?as=<persona>` and never types a Slack password. Every journey ends with `expectAccessible(page)`, which runs axe for WCAG 2.2 AA and fails on any violation.

Personas are in `apps/web/src/server/services/dev-seed.ts`: `lead` has live, scheduled and closed hollers; `sender` has nothing, for the empty states. Parallel workers sign in at the same time, so every seed write is guarded by a unique index and re-read when it loses the race; `routes/dev-concurrency.test.ts` fires first sign-ins at once and checks each one succeeds and the seed lands once.

Another worker's sign-in can re-seed the workspace mid-test, so a journey reads back what it made by id (`e2e/editor.spec.ts` asks `/api/hollers/<id>`), never from a list on Home. Axe reads colours mid-fade as low contrast, so run it once a list or dialog has settled. Base UI hides a toast's close button from screen readers until the toasts expand, so `e2e/audience.spec.ts` finds it by `data-slot="toast-close"`, not by role.

The design site drives the real editor with fakes: `design/parts/editor.tsx` passes an in-memory server that saves, flags problems and refuses as the API does, and dated demos such as the one in `design/parts/forms.tsx` fall on the next Monday at nine, so none shows a time already gone.

## Proving a change in the browser

The [`verify`](../.agents/skills/verify/SKILL.md) skill is the proof for a change a person sees. It starts the product (or uses the `holler` entry in `.claude/launch.json`, port 5280), signs in through `/api/dev/sign-in?as=<persona>&reset=1`, drives each feature in its map by role and accessible name at 1280 px and 375 px, in day and night, and keeps a screenshot, an ARIA snapshot and the stored state for every step. `/api/dev/state`, `/api/dev/tick` and `/api/dev/answer` let a recipe read back what it did, let a close time pass, and answer as a recipient. Components are on the design site (`pnpm --filter @holler/web design:dev`, the `holler-design` entry, port 5282).
