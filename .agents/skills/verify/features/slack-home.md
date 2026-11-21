# Holler inside Slack for senders

App Home, `/holler`, the quick pulse and `/holler results`, through the same signed routes Slack calls. `services/slack-home.ts`, `slack/commands.ts` and `slack/interactions.ts` own it; docs/slack.md, App Home and `/holler`, is the design.

## Reach

Slack draws these surfaces, so there is no screen to click. `POST /api/dev/slack` sends a command, an interaction or an event as Slack would, signed, from the Slack user named in `as`; `/api/dev/state` → `slack.homes`, `slack.views` and `slack.viewUpdates` hold the text of every Home published and every modal opened or rewritten. The web Home shows the result.

## Drive

[`slack-home.mjs`](slack-home.mjs) as `lead`: open the Home, type `/holler Pizza or tacos on Friday?`, send the quick pulse to two seeded people, list it with `/holler results`, press Send reminder on the Home, then open the Home as one of the two.

## End state

Mira's Home shows "Your hollers" with the seeded live pulse; the quick pulse modal opens with the question filled in and is rewritten to "went to 2 people"; `slack.posted` holds the two invites and, after Send reminder, two reminders; Mira's last Home says "Reminder sent at"; Amara's Home lists the pulse under "Waiting on you"; the web Home links it.

## Gotchas

- A publish after a change waits five seconds on the queue to gather the changes that follow it. The recipe reads Homes published at once: on opening, and after a press on the Home.
- A pulse has no title, so `/api/dev/state` lists it with an empty title; the recipe finds it by its recipients.
