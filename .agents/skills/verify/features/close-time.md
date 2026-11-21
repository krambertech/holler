# A holler closes at its close time

The cron closes every live holler whose close time has passed and records `holler.closed` Activity. `services/lifecycle.ts` owns it; `apps/web/src/server/cron.ts` runs it every minute.

## Reach

Nothing to click: time passes. Locally, `POST /api/dev/tick` with `at` set past the close time.

## Drive

[`close-time.mjs`](close-time.mjs) as `lead`: confirm **Offsite: which dates work?** is live, tick a minute past its close time, reload Home, and open it.

## End state

The tick returns its id in `closed`, `/api/dev/state` shows it `closed` with a `holler.closed` Activity row via `system`, Home moves it from **Live** to **Closed**, and its page reads **Closed**.

## Gotchas

- Read the close time from `/api/dev/state`; the seed sets it relative to the reset.
