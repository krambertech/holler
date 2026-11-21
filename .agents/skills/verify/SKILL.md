---
name: verify
description: Prove a Holler product change works by driving the running app as a sender and keeping the evidence. Use before calling a product change done, before opening a pull request, or when asked whether a feature works in the real app. Skip changes with no product effect.
---

# Verify the product

A change is verified when every feature it reaches has been driven in a running product, by ARIA role and accessible name, and the stored state agrees with the screen. Typechecks, unit tests and green CI are not this proof, and neither is reading the code.

## Pick the features

[`features/`](features) has one entry per sender-facing feature: how to reach it, what the recipe drives, the end state that proves it, and its gotchas. Drive every entry the diff can reach. When the diff touches a feature with no entry, write its `.md` and its `.mjs` recipe in the same pull request; a feature without a recipe is unverified.

| Feature | Entry |
| --- | --- |
| Sign in | [sign-in.md](features/sign-in.md) |
| Home | [home.md](features/home.md) |
| An answer reaches the results | [answer.md](features/answer.md) |
| A holler closes at its close time | [close-time.md](features/close-time.md) |
| Make an API key | [api-keys.md](features/api-keys.md) |
| Make a Holler | [editor.md](features/editor.md) |

## Launch

On the desktop app, start the `holler` entry in `.claude/launch.json` with the Browser pane and use the port it reports. Anywhere else, run `node .agents/skills/verify/scripts/server.mjs start`. It writes `apps/web/.dev.vars` from the example with `DEV_ROUTES=true` when there is none, migrates the local D1 (rebuilding it when a migration fails), starts the product on 5280 or the next free port, and prints the origin once `/api/health` answers.

## Doctor

```bash
node .agents/skills/verify/scripts/doctor.mjs --url http://localhost:5280 --persona lead
```

A read-only check that the instance is worth driving. `/api/health` must name the `holler` worker, and the process listening on the port must run from this worktree at `--sha` (default `HEAD`). With `--session`, a Playwright storage state, it also reads `/api/dev/state` and requires the expected persona. The runner calls it after signing in and stops before driving when any check fails. Run it alone when a recipe fails, to tell a broken feature from the wrong server.

## Drive

```bash
node .agents/skills/verify/scripts/run.mjs home answer --pr <n>
```

Each feature signs in through `/api/dev/sign-in?as=<persona>&reset=1`, so it starts from the persona's seeded data whatever ran before, then runs the doctor, then the recipe in `features/<feature>.mjs`. The runner drives Chromium at 1280 px with a pointer and reduced motion. Run every feature four times for a change a person sees: plain, `--dark`, `--phone` (375 px with touch), and `--phone --dark`. `--url` drives another origin; for a pull request's preview, also pass its `DEV_ROUTES_KEY` with `--key` (or `HOLLER_DEV_KEY`) and `--version` with the id from the preview job's summary, as [`docs/operations.md`](../../../docs/operations.md#previews) shows. The doctor requires the preview to serve that version.

A recipe exports `title`, optional `persona` (default `lead`) and `start` (default `/`), and a default function that receives `{ page, step, api, post, expect }`. `step(action, run)` is one sender action and its check; `run` returns the stored values that prove it. `api(path)` reads and `post(path, body)` writes through the session. Find elements by role and accessible name, never by CSS or test id; a control a recipe cannot name is an accessibility bug to fix, not to work around.

### Dev routes

`apps/web/src/server/routes/dev.ts` owns them, behind `DEV_ROUTES=true`.

- `GET /api/dev/state`: the persona, member, every holler with its recipients, answered count and waiting Slack ids, and the last 20 Activity rows.
- `POST /api/dev/tick` with `{ "at": "<ISO time>" }`: runs the cron's pass at that time, so a close time passes without waiting.
- `POST /api/dev/answer` with `{ hollerId, slackUserId, response }`: answers as a recipient, the way their Slack button would, through `recordResponse`.

Slack sending is still a placeholder (`services/delivery.ts`). When it lands, add what `FakeSlack` sent to `/api/dev/state` so a recipe can prove a message or reminder went out.

## Evidence

Every step leaves its screenshot, the ARIA snapshot of `main`, and `/api/dev/state` with the step's stored values. `verdict.md` beside them lists the doctor's result, each step as ok or FAIL with its error, and every console error and 5xx response. A run that logs errors is not a clean pass even when every step is ok; say what they were.

Evidence goes to `$HOLLER_EVIDENCE_DIR/<pr-n or branch>/<feature>-<where>[-phone][-night]-<sha>/`, or the temp directory when that is unset. Name the folder in the pull request's Verification section and attach the screenshots a reviewer needs. Persona data is seeded, so the files carry no private content; never drive a real Slack account to produce them.

## Cleanup

The runner closes its browser. `node .agents/skills/verify/scripts/server.mjs stop` ends only the process group `start` recorded; a server the launch configuration started stays up. Keep the evidence. A failing step is a finding to fix or report, never a reason to delete its files.

## Gotchas

- `reset=1` deletes the whole dev workspace, which every persona shares. Never drive the same local D1 while someone uses it by hand.
- The runner signs in with `reset=1` before each feature, so one feature's writes never leak into the next.
- Seeded times are relative to the moment of the reset, so read close times from `/api/dev/state` rather than hard-coding them.
