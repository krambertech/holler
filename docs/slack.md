# Slack

Slack is where Holler lives day to day. The person answering should never need the web app, and a sender should be able to do the common things without leaving Slack. This file is the design for every Slack surface. The words follow [CONTEXT.md](../CONTEXT.md) and the voice rules in [DESIGN.md](../DESIGN.md).

## The app

One Slack app, distributed through OAuth to any workspace. Bot scopes:

| Scope                            | Why                                                       |
| -------------------------------- | --------------------------------------------------------- |
| `chat:write`                     | DMs, reminders, thank-yous, announcements                 |
| `im:write`                       | Open the DM with a recipient                              |
| `users:read`, `users:read.email` | The audience picker, names, avatars, time zones           |
| `usergroups:read`                | Send to a user group                                      |
| `channels:read`, `groups:read`   | Send to a channel's members, pick an announcement channel |
| `commands`                       | `/holler`                                                 |
| `app_mentions:read`              | Not used in the first version                             |

User sign-in is "Sign in with Slack" (OpenID Connect, scopes `openid profile email`), handled by Better Auth. Installing ("Add to Slack") and signing in are two flows; the install page runs the second straight after the first.

Endpoints, all on the product Worker, all signature-checked with `verifySlackRequest` before anything reads the body:

| Path                    | Slack sends                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| `/slack/oauth/callback` | The install redirect. Stores the bot token encrypted (`encryptToken`)                          |
| `/slack/events`         | Events API: `app_home_opened`, `app_uninstalled`, `tokens_revoked`, `user_change`, `team_join` |
| `/slack/interactions`   | Buttons, modals, shortcuts                                                                     |
| `/slack/commands`       | `/holler`                                                                                      |

Every handler acknowledges within three seconds. Anything slower runs in `waitUntil` or goes on the `SLACK_SENDS` queue. Retries are dropped by recording Slack's event or view id in `slack_deliveries`. Every Slack call goes through `SlackClient` in `apps/web/src/server/slack/client.ts`; tests use `FakeSlack`.

## Answering: as few taps as the question allows

The invite DM adapts to the Holler, so answering costs the least the question allows.

| The Holler                                                                                 | How it is answered                                                                                               |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| A pulse with one single-choice question of at most 5 options                               | One tap on a button in the DM. No modal                                                                          |
| A pulse or survey that fits a modal (at most 100 blocks, at most 100 options per question) | **Answer** opens a modal. Radio buttons and checkboxes up to 10 options, a select menu above that                |
| Anything bigger                                                                            | **Answer** links to the web form at `/respond/<id>`, which identifies the person through a signed link in the DM |
| A form chase                                                                               | **Open the form** links out; **I submitted it** records the response                                             |

After a response, the DM is updated in place with a short thank-you and what they answered (or "Answered anonymously"), so the conversation never shows a stale question. An answer to a closed Holler gets a polite line saying it closed, not an error.

## Messages

Every message sets `text` to the question or the point, because that is what notifications and screen readers read. No emoji. The context line comes after the question.

**Invite.** "_Mira_ sent you a Holler." Then the title in bold, the description as mrkdwn, a context line ("Pulse · 2 questions · Closes Friday at 18:00 · Anonymous"), and the answer controls above.

**Reminder.** Three tones, each a new DM so it notifies, each replacing the stored `dm_ts`:

- Gentle (a day in): "A reminder: Mira still needs your answer to _How was your week?_"
- Nudge (three days in): "Mira is still waiting on your answer to _How was your week?_ It takes a minute."
- Last (five days in): "Last reminder: _How was your week?_ closes Friday at 18:00."

Each reminder carries **Answer now** and **Remind me later** (snooze to 15:00 today, or 09:00 tomorrow after 15:00). The rhythm, working hours and the quiet time before closing are in `packages/core/src/reminders.ts`, which both the cron and the web app read.

**Channel announcement.** Optional. "Mira sent a Holler to 12 people: _How was your week?_" with a live line, "7 of 12 answered", updated in place after each response, and a closed state when it closes. It never names who answered.

**To the sender.** When a Holler closes: "_How was your week?_ closed. 11 of 12 answered." with **See results**. When a scheduled send fails: what failed and a link to fix it. When results are shared with someone: "Mira shared the results of _How was your week?_ with you."

## App Home

The App Home tab is the sender's Home in Slack: the three numbers, live hollers with their counts and **Send reminder**, and **New holler**. For a recipient it lists what is waiting on them with **Answer** buttons, so a lost DM is never a lost question. Published with `views.publish` on `app_home_opened` and after each change that affects that person, debounced.

## `/holler`

- `/holler` opens a modal to write a quick pulse: question, options or a template, who, when it closes. Longer hollers get **Open in Holler** to the web editor.
- `/holler results` lists your live hollers with their counts, only to you.
- A message shortcut, **Send a Holler about this**, starts a pulse with the message linked in its description.

## Limits

| Limit                                  | Value                                         | Where it bites                                            |
| -------------------------------------- | --------------------------------------------- | --------------------------------------------------------- |
| Blocks in a modal                      | 100                                           | Long surveys go to the web form                           |
| Options in radio buttons or checkboxes | 10                                            | Above that, a select menu                                 |
| Options in a select                    | 100                                           | Above that, the web form                                  |
| Buttons in an actions block            | 25                                            | One-tap answers stop at 5 options by choice               |
| `chat.postMessage`                     | About one per second per channel, with bursts | Sends go through the queue with backoff and `Retry-After` |
| Acknowledging a request                | 3 seconds                                     | Slow work in `waitUntil` or the queue                     |
