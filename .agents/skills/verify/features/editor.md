# Make a Holler

The editor: the start screen, Compose (title and questions) and Send (who, when and how), saving as the sender types.

## Reach

**New holler** on Home, which opens `/new`. A saved draft opens at `/new?draft=<id>`; `/hollers/<id>` sends a draft there.

## Drive

[`editor.mjs`](editor.mjs) as `lead`: pick Survey on the start screen, write a title and a single-choice question with two options, wait for the draft to save, reload, move to Send, and press Send with nobody chosen.

## End state

`/api/dev/state` lists the new draft with its title. After the reload the question and its options are still there. Send names "Choose who to send it to." on the Send stage, and the draft is still a draft.

## Gotchas

- Autosave waits for the typing to stop, so wait for **Draft saved** before reading the state.
- Sending itself stops at the Slack delivery placeholder (`slack_unavailable`); this recipe proves the problems before it, not a send.
- At 375 px the bar's secondary button is hidden; the recipe only uses the plum one.
