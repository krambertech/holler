# Testing

Every rule Holler cares about fails a check instead of waiting for review. Run the whole gate before you push:

```bash
pnpm verify
```

## What runs

| Command                 | What it proves                                                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm check`            | oxfmt and Oxlint, with unused suppressions as errors, `check:design` (DESIGN.md matches the tokens, named components exist), `check:styling` (no raw colours, stock Tailwind colours or physical directions in any file), `check:comments` (no file holds more comment lines than its baseline, and no baseline allows more than its file holds) |
| `pnpm guards:check`    | Every guard matches the code it protects, and every lint rule and check script has one |
| `pnpm guards:prove`    | Every check fails when its mistake is brought back. CI runs it in four parts |
| `pnpm check:models`    | Every order of the steps in the TLA+ models in `formal/` keeps Holler's promises about sending, closing and rounds, and each past bug and recorded finding still breaks the one it names. Needs Java; CI's `models` job runs it |
| `pnpm check:models:sync` | No function a model describes changed since it was last confirmed. `pnpm check` runs it |
| `pnpm check:migrations` | No applied migration changed, and the schema needs no migration that is missing                                                                                                                    |
| `pnpm typecheck`        | Every package and both Workers, strict                                                                                                                                                     |
| `pnpm test`             | Vitest in every package, plus `node --test` for the repo scripts                                                                                                                           |
| `pnpm build`            | Both apps build                                                                                                                                                                            |
| `pnpm check:boundaries` | The production product bundle has no dev tools; the site has no product code                                                                                                               |
| `pnpm test:e2e`         | Playwright journeys in Chromium and WebKit, with axe on every page they visit                                                                                                              |

## Unit and service tests

- `packages/core`: pure rules. Results maths, the anonymous gate, the reminder rhythm, plan limits, the API schemas.
- `packages/design`: every text pair in `src/pairs.ts` meets its WCAG floor in both themes, and the OS dark block matches the `[data-theme="dark"]` block token for token.
- `apps/web/src/server`: services against a real local D1 with every migration applied (`testDb()` in `test-db.ts`). Each file boots its own. Use `workspaceFixture()` for a workspace and a member, and `FakeSlack` instead of slack.com.

Anything that sends uses `deliveryEnv()` in `test-delivery.ts`: its queue refuses what Cloudflare Queues would (over 100 messages or 256 KB a batch), can refuse a kind of send or fail midway, and `drain(at)` runs the consumer by hand. Tests run shuffled, in the same order every run (`apps/web/vitest.config.ts`), so each test sets up what it reads: a file whose tests run the cron's passes calls `emptyDatabase()` before each test, because a pass reads every workspace, and a dev route test signs in with `reset=1`. Try another order with `--sequence.seed=<n>`. Fix the clock: pass a `now` to `workspaceFixture()`, and `vi.setSystemTime` for a route that reads it.

Test a service, not a route, unless the route itself has logic. A service test names the rule it proves: "refuses an option from another question", not "works".

**A Worker can die between any two writes.** `apps/web/src/server/crash-sweep/` runs each operation that sends, answers or closes against a real local D1. It kills the operation after every write, queue batch and Slack call, refuses each one, and kills the release that follows a refusal; nothing later in it runs, not even a catch. Then the cron and the consumer run on, the person retries, and every promise in `promises.ts` is checked. A new write is swept without a change here; a new operation needs a line in `scenarios.ts`, and a new kind of send fails the sweep until it has one. `known-windows.ts` lists the failures that break a promise today, worst first. A new one fails the test, and so does a listed one that no longer breaks. `tradeOff` marks what no code can settle: whether Slack took a post whose result was never stored. `postings` says which way each kind falls.

**A bug gets a check for its class.** When a bug turns up, write the check that fails for every bug of its kind, not only this one: a rule in `oxlint-plugin-holler/rules/` with its test beside it, a limit a fake enforces, a sweep over every zone or day, or a concurrency or failure test across every door. Then add its guard.

**A guard proves its check can fail.** `guards/<rule>.json` names the rule, the `layer` that holds it, the `past` mistake, the `check` command, and one proof: `break`, edits that bring the mistake back, or `refuses`, a command with a bad input. `fails` is text the failing check must print, so a check that fails for another reason does not count. `pnpm guards:prove <rule>` copies the tree, runs the check on it, makes the edits and runs it again. Filter the check to the tests that hold the rule (`-t`), so a proof takes seconds. A guard with the layer `browser` runs in the e2e job.

**Orders of events are modelled.** [`formal/`](../formal) has two TLA+ models, and the [`verify-delivery-model`](../.agents/skills/verify-delivery-model/SKILL.md) skill says how to read, change and confirm them ([ADR 0005](adr/0005-tla-models-for-delivery-and-rounds.md)). What the code gets wrong today is in [`formal/counterexamples.md`](../formal/counterexamples.md).

## Browser journeys

`e2e/` runs the product and the site on their own ports with `HOLLER_E2E=1`, signs in through `/api/dev/sign-in?as=<persona>` and never types a Slack password. Every journey ends with `expectAccessible(page)`, which runs axe for WCAG 2.2 AA and fails on any violation.

Personas are in `apps/web/src/server/services/dev-seed.ts`: `lead` has live, scheduled and closed hollers; `sender` has nothing, for the empty states. Parallel workers sign in at the same time, so every seed write is guarded by a unique index and re-read when it loses the race; `routes/dev-concurrency.test.ts` fires first sign-ins at once and checks each one succeeds and the seed lands once.

## Proving a change in the browser

The [`verify`](../.agents/skills/verify/SKILL.md) skill is the proof for a change a person sees. It starts the product (or uses the `holler` entry in `.claude/launch.json`, port 5280), signs in through `/api/dev/sign-in?as=<persona>&reset=1`, drives each feature in its map by role and accessible name at 1280 px and 375 px, in day and night, and keeps a screenshot, an ARIA snapshot and the stored state for every step. `/api/dev/state`, `/api/dev/tick` and `/api/dev/answer` let a recipe read back what it did, let a close time pass, and answer as a recipient. Components are on the design site (`pnpm --filter @holler/web design:dev`, the `holler-design` entry, port 5282).
