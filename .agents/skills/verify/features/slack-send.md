# A holler goes out in Slack and comes back answered

Sending, answering, Send reminder and closing, end to end through the SLACK_SENDS consumer and the dev FakeSlack. `services/delivery.ts` owns it; docs/slack.md is the design.

## Reach

No screen sends yet; the recipe uses the routes the editor and the results page will: `POST /api/hollers`, `/send`, `/remind`, `/close`. Home shows the result.

## Drive

[`slack-send.mjs`](slack-send.mjs) as `lead`: send a pulse to three seeded people with an announcement in #general, answer as one of them through `POST /api/dev/answer`, send a reminder, try a second, close it.

## End state

`/api/dev/state` → `slack.posted` holds three invites from Mira, the #general announcement, two reminders and the close notice "Lunch on Friday? closed. 1 of 3 answered."; `slack.updated` holds the thank-you in `D0AT`. A second Send reminder answers 409. Home lists it.

## Gotchas

- `slackState` waits up to five seconds for the consumer, then fails with what Slack did get.
- The seed leaves at least two of Free's five hollers each month; `services/dev-seed.test.ts` keeps it that way.
