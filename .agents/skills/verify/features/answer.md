# An answer reaches the results

A recipient answers in Slack, and the sender sees it on the holler's page and on Home. Every door records an answer through `recordResponse` in `services/responses.ts`.

## Reach

Home, then the holler's link: `/hollers/<id>`.

## Drive

[`answer.mjs`](answer.mjs) as `lead`: open the live **How was your week?** pulse, have its first waiting recipient answer **Great** through `POST /api/dev/answer`, reload, then go back Home.

## End state

`/api/dev/state` counts one more answered recipient and drops them from `waiting`. The page shows one more **answered** and the new text answer, and Home shows the new `<answered> of <recipients>`.

## Gotchas

- Seed has two hollers titled **How was your week?**; take the live one.
- A second answer from the same person is refused with 409, so each run needs `reset=1`.
