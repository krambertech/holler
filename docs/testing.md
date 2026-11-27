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
| `pnpm typecheck`        | Every package, both Workers and the browser journeys, strict                                                                                                                                                     |
| `pnpm check:architecture` | Every import keeps to its layer, there are no import cycles, and `scripts/architecture.json` gains no exception. Part of `pnpm check` |
| `pnpm check:limits` | Every number in `oxlint-limits.json` is as low as its file allows, and none rose since the base. Part of `pnpm check` |
| `pnpm check:dead-code` | Knip finds no unused file, export or dependency. Part of `pnpm check` |
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

**A Worker can die between any two writes.** `apps/web/src/server/crash-sweep/` runs each operation that sends, answers or closes against a real local D1. It kills the operation after every write, queue batch and Slack call, refuses each one, and kills the release that follows a refusal; nothing later in it runs, not even a catch. Then the cron and the consumer run on, the person retries, and every promise in `promises.ts` is checked. A new write is swept without a change here; a new operation needs a line in `scenarios.ts`, and a new kind of send fails the sweep until it has one. `known-windows.ts` lists the failures that break a promise today, worst first. A new one fails the test, and so does a listed one that no longer breaks. `tradeOff` marks what no code can settle: whether Slack took a post whose result was never stored. `postings` says which way each kind falls.

**A bug gets a check for its class.** When a bug turns up, write the check that fails for every bug of its kind, not only this one: a rule in `oxlint-plugin-holler/rules/` with its test beside it, a limit a fake enforces, a sweep over every zone or day, or a concurrency or failure test across every door. Then add its guard.

**A guard proves its check can fail.** `guards/<rule>.json` names the rule, the `layer` that holds it, the `past` mistake, the `check` command, and one proof: `break`, edits that bring the mistake back, or `refuses`, a command with a bad input. `fails` is text the failing check must print, so a check that fails for another reason does not count. `pnpm guards:prove <rule>` copies the tree, runs the check on it, makes the edits and runs it again. Filter the check to the tests that hold the rule (`-t`), so a proof takes seconds. A guard with the layer `browser` runs in the e2e job.

**Orders of events are modelled.** [`formal/`](../formal) has two TLA+ models, and the [`verify-delivery-model`](../.agents/skills/verify-delivery-model/SKILL.md) skill says how to read, change and confirm them ([ADR 0005](adr/0005-tla-models-for-delivery-and-rounds.md)). What the code gets wrong today is in [`formal/counterexamples.md`](../formal/counterexamples.md).
## Limits that only fall

`check:architecture`, `check:limits` and `check:dead-code` each compare their recorded list with the one at the merge base (`scripts/base.mjs`), so a pull request can shorten a list and cannot lengthen it. CI checks out the whole history for this and fails without a base. Each also refuses an entry that is no longer needed, so the lists fall on their own.

- **Layers.** A type-only import is erased, so it never makes a cycle, but it still ties two layers together: the client may not import a server type. `mayImportTypes` is the exception, for `Auth` and `AppEnv`, which describe values the server's root hands down. Test files are free of the layers, and nothing imports test support but them.
- **Size.** Limits are whole steps (50 lines, 5 branches), so an ordinary edit leaves `oxlint-limits.json` alone and two branches rarely touch it. Test files have no limit.
- **Dead code.** `ignoreIssues` in `knip.json` holds exports that open pull requests use or that sit in files they change: `LimitReached` and the dropdown menu's parts wait for #11, #21 and #33, and the rest go when the pull request that changes the file lands.

Oxlint's typed rules (`--type-aware`, which `pnpm check` passes) need `oxlint-tsgolint`, pinned beside it. An unawaited promise in a Worker dies with the request.

## Browser journeys

`e2e/` runs the product and the site on their own ports with `HOLLER_E2E=1`, signs in through `/api/dev/sign-in?as=<persona>` and never types a Slack password. Every journey ends with `expectAccessible(page)`, which runs axe for WCAG 2.2 AA and fails on any violation.

Every test has its own workspace. `e2e/fixtures.ts` sends a random `x-holler-dev-workspace` key with each request, and dev sign-in makes and seeds that workspace with every persona. A test can change anything, in both browsers at once. Use `signInAs(page, persona)` for a page and the `requestAs` fixture for API calls; both use the test's own workspace. `/api/dev/tick` refuses a keyed caller, because a tick runs every workspace. A flaky test fails: `failOnFlakyTests` is on and `holler/no-flaky-escape` refuses retries, sleeps and bare skips.

Personas are in `apps/web/src/server/services/dev-seed.ts`: `lead` has live, scheduled and closed hollers; `sender` has sent nothing, for the empty states. `routes/dev-concurrency.test.ts` fires first sign-ins at once and checks that each succeeds and the seed lands once.

Another worker's sign-in can re-seed the workspace mid-test, so a journey reads back what it made by id (`e2e/editor.spec.ts` asks `/api/hollers/<id>`), never from a list on Home. Axe reads colours mid-fade as low contrast, so run it once a list or dialog has settled. Base UI hides a toast's close button from screen readers until the toasts expand, so `e2e/audience.spec.ts` finds it by `data-slot="toast-close"`, not by role.

The design site drives the real editor with fakes: `design/parts/editor.tsx` passes an in-memory server that saves, flags problems and refuses as the API does, and dated demos such as the one in `design/parts/forms.tsx` fall on the next Monday at nine, so none shows a time already gone.

## Proving a change in the browser

The [`verify`](../.agents/skills/verify/SKILL.md) skill is the proof for a change a person sees. It starts the product (or uses the `holler` entry in `.claude/launch.json`, port 5280), signs in through `/api/dev/sign-in?as=<persona>&reset=1`, drives each feature in its map by role and accessible name at 1280 px and 375 px, in day and night, and keeps a screenshot, an ARIA snapshot and the stored state for every step. `/api/dev/state`, `/api/dev/tick` and `/api/dev/answer` let a recipe read back what it did, let a close time pass, and answer as a recipient. Components are on the design site (`pnpm --filter @holler/web design:dev`, the `holler-design` entry, port 5282).
