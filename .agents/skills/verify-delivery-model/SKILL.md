---
name: verify-delivery-model
description: Check a change to sending, reminders, answering, closing, the SLACK_SENDS queue or repeating rounds against the TLA+ models in formal/. Use when a change touches services/delivery.ts, reminders.ts, rounds.ts, lifecycle.ts, responses.ts, respond.ts, answering.ts, slack-deliveries.ts, cron.ts or slack/queue.ts, or when `pnpm check:models` or `pnpm check:models:sync` fails.
---

# Verify the delivery and rounds models

Two TLA+ models check every order in which these steps can happen, within bounds. [ADR 0005](../../../docs/adr/0005-tla-models-for-delivery-and-rounds.md) says why TLA+.

| Promise | What a break does to people |
| --- | --- |
| `NothingPostsTwice`: one invite and one reminder of each tone to a person, one announcement, one close notice | Their DMs ring twice for one ask |
| `NoReminderAfterAnswer` | Someone who answered is chased |
| `ClosedIsToldOnce`: everyone with an unanswered DM sees it closed, the creator gets one close notice | People answer a closed Holler, the creator never hears |
| `ClaimedWorkIsNeverLost`: what was claimed is posted, or given back to the cron | Someone is never asked or reminded, and the pages say they were |
| `KeptAnswersReachSlack`: whoever is marked answered has a response, a thank-you and a place in the count | Their DM asks for an answer Holler has, or thanks them for one it lost |
| `NothingGoesOutAfterStop` | A pulse goes on after Stop repeating said it stopped |
| `OneNextRound` | A pulse stops without a word, or goes out twice |

## Does a change touch the models

`pnpm check:models:sync` answers it, without Java, and `pnpm check` runs it. [`formal/delivery/covers.json`](../../../formal/delivery/covers.json) and [`formal/rounds/covers.json`](../../../formal/rounds/covers.json) are the coverage record: each covered function, a hash of its tokens without comments and spacing, and `commit`, the sync commit at which the model was last confirmed to describe them. `+changes` after it means the confirmed code was not committed yet. Read what changed since with `git diff <commit> -- <file>`.

A change the hashes cannot see still counts when it adds a step: a new caller of `queueClaimed`, `postOnce` or `recordResponse`, a new kind of send, a new pass in `runCronPass`, the unique index `hollers_round`, or `max_retries` in `apps/web/wrangler.jsonc`. Add the new function to `covers.json` with an empty hash, change the spec, and confirm.

## Run it

```bash
pnpm check:models                         # everything, under a minute
pnpm check:models delivery/closing        # one run; `delivery` is the whole model
pnpm check:models delivery --steps        # every counterexample as steps
pnpm check:models --config delivery/closing   # the TLC config of one run
```

It needs Java 11 or later. The first run downloads `tla2tools.jar`, pinned by version and sha256 in `scripts/check-models.mjs`, into `~/.cache/holler`, which every worktree shares. A run in `formal/<model>/model.json` is one of four things:

- **The current design** (`says`): every promise has to hold.
- **A past bug** (`past`) or **a protection taken out** (`removed`): the promise in `breaks` has to fail.
- **A finding** (`finding`): the code today breaks the promise in `breaks` under the misbehaviour it turns on. It has to keep failing, with the counterexample in [`formal/counterexamples.md`](../../../formal/counterexamples.md).

Read each result with the pstack `/statechart` skill when you have it: give it the spec and the config that `--config` prints, saved to a file. It draws a chart of up to 500 states, so lower `Last` to 3 for `rounds/repeating`; for `delivery` it draws the paths to a broken promise. The steps `pnpm check:models` prints are the same path in words.

## When a covered function changed

1. Read the diff beside the spec. Each action names its function and says one step: one D1 statement or batch, one `sendBatch` call, or one Slack call.
2. Ask whether a step, its guard, what it reads, or the order of two steps changed. Wording, types, message text and anything inside one step do not matter.
3. If none did, go to 5.
4. If one did, change the spec to what the code does now, not to what it should do. Keep one indivisible step in the code one action. A new protection is a constant that a `removed` or `past` run turns off, so its run shows it is needed. Run `pnpm check:models`.
5. When it passes, `pnpm check:models --confirm delivery` (or `rounds`). Move the sync commit forward only then: it says you read the code at that commit and the model describes it. If a counterexample changed for a reason you understand, `pnpm check:models --record` rewrites `formal/counterexamples.md`; read its diff.

## When a promise breaks

`✗ delivery/closing: the current design breaks ClosedIsToldOnce` prints the shortest path. Decide which it is before you change anything.

- **A real bug:** each step is in the code, in that order, with nothing between them that the model left out. Replay it: a test beside `delivery.test.ts` or `rounds.test.ts` that does one thing per step. `deliveryEnv()` refuses sends with `refuse`, `drain` is the consumer, a `SLACK_SENDS` whose `sendBatch` never settles is a Worker that died, and a Proxy over `db.batch` runs another step in between (`rounds.test.ts` does it). If the test shows the harm, fix the code, not the spec.
- **A modelling error:** the replay does not show it. Find the guard, read or transaction the spec is missing and put it in, named after the code. Never loosen a promise, drop an interleaving or lower a bound to get a pass.

A past or removed run that no longer fails means the spec lost a step that mattered: put it back.

A finding that no longer fails is good news when the code was fixed. Delete its run, turn its misbehaviour on in a current-design run so it stays checked, keep the old way as a `past` run with a guard of layer `model`, then `--record`.

A break you cannot fix in this change becomes a `finding` run with one plain sentence of what happens and whom it harms, and you report it. It is not a reason to weaken a promise.

## What it covers, and what it does not

- **Bounds.** `delivery`: one Holler and one person with two overlapping cron passes, two consumers, one reminder, and one each of a queue refusal, a Slack failure and a duplicate delivery; or two Hollers closing over two passes with one consumer. `rounds`: four rounds, two overlapping sends, one Stop repeating.
- **Assumed in the current design, off until a finding turns it on.** No Worker dies (`CrashIn`). No answer or close lands between a consumer's read and its last write, and no Holler closes while someone has an unsent retry (`Lands`). Slack recovers before `max_retries` runs out (`QueueGivesUp`). A call that throws did nothing (`SlackLosesReply`, `QueueLosesReply`, `D1Fails`). People told to try again do (`PersonGivesUp`).
- **Time.** A reminder, a close time and a due round can come at any moment. The day a close or a missing announcement is retried for, the pruning of post keys, time zones and the reminder rhythm are left out.
- **One step here, more in the code.** `deliver`'s reads (`loadSlackHoller`, `recipientFor`) are one read. Batches of more than 100 sends are two at most. A duplicate message is a second copy, acked on its own.
- **Left out.** Send reminder (`remindWaiting`), App Home (the `home` send, and `refreshHomes` after a step, which never throws and changes only `slack_homes` and a person's Home), snoozes, notes, permanent Slack failures, `send_failed` notices, `sendHoller`'s checks, the announcement's final count at close, Activity rows, uninstalls, and deleting or editing a Holler.
