# Testing

Every rule Holler cares about fails a check instead of waiting for review. Run the whole gate before you push:

```bash
pnpm verify
```

## What runs

| Command                 | What it proves                                                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm check`            | Biome lint and format, `check:design` (DESIGN.md matches the tokens, named components exist), `check:styling` (no raw colours, stock Tailwind colours or physical directions in new lines) |
| `pnpm check:migrations` | Drizzle's snapshot matches the schema, and no applied migration changed                                                                                                                    |
| `pnpm typecheck`        | Every package and both Workers, strict                                                                                                                                                     |
| `pnpm test`             | Vitest in every package, plus `node --test` for the repo scripts                                                                                                                           |
| `pnpm build`            | Both apps build                                                                                                                                                                            |
| `pnpm check:boundaries` | The production product bundle has no dev tools; the site has no product code                                                                                                               |
| `pnpm test:e2e`         | Playwright journeys in Chromium and WebKit, with axe on every page they visit                                                                                                              |

## Unit and service tests

- `packages/core`: pure rules. Results maths, the anonymous gate, the reminder rhythm, plan limits, the API schemas.
- `packages/design`: every text pair in `src/pairs.ts` meets its WCAG floor in both themes, and the OS dark block matches the `[data-theme="dark"]` block token for token.
- `apps/web/src/server`: services against a real local D1 with every migration applied (`testDb()` in `test-db.ts`). Each file boots its own. Use `workspaceFixture()` for a workspace and a member, and `FakeSlack` instead of slack.com.

Test a service, not a route, unless the route itself has logic. A service test names the rule it proves: "refuses an option from another question", not "works".

## Browser journeys

`e2e/` runs the product and the site on their own ports with `HOLLER_E2E=1`, signs in through `/api/dev/sign-in?as=<persona>` and never types a Slack password. Every journey ends with `expectAccessible(page)`, which runs axe for WCAG 2.2 AA and fails on any violation.

Personas are in `apps/web/src/server/services/dev-seed.ts`: `lead` has live, scheduled and closed hollers; `sender` has nothing, for the empty states.

## Proving a change in the browser

The [`verify`](../.agents/skills/verify/SKILL.md) skill is the proof for a change a person sees. It starts the product (or uses the `holler` entry in `.claude/launch.json`, port 5280), signs in through `/api/dev/sign-in?as=<persona>&reset=1`, drives each feature in its map by role and accessible name at 1280 px and 375 px, in day and night, and keeps a screenshot, an ARIA snapshot and the stored state for every step. `/api/dev/state`, `/api/dev/tick` and `/api/dev/answer` let a recipe read back what it did, let a close time pass, and answer as a recipient. Components are on the design site (`pnpm --filter @holler/web design:dev`, the `holler-design` entry, port 5282).
