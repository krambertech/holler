# Make a Holler

The editor: the start screen, the writing page (title and questions) and the sending page (who gets it, when it goes out, and its settings), saving as the sender types.

## Reach

**New holler** on Home, which opens `/new`. A saved draft opens at `/new?draft=<id>`; `/hollers/<id>` sends a draft there.

## Drive

[`editor.mjs`](editor.mjs) as `lead`: pick Survey on the start screen, write a title and a single-choice question with two options, wait for the draft to save, reload, move to the sending page and check the back link kept its place, press Send later and see the day, time and time-zone choice open in the Sends row, press Send now instead, and press Send with nobody chosen.

## End state

`/api/dev/state` lists the new draft with its title. After the reload the question and its options are still there. The back link sits at the same point on both pages. Send names "Choose who to send it to." on the sending page, and the draft is still a draft.

## Gotchas

- Autosave waits for the typing to stop, so wait for **Draft saved** before reading the state.
- Sending itself stops at the Slack delivery placeholder (`slack_unavailable`); this recipe proves the problems before it, not a send.
- At 375 px the bar's Preview button shows only its eye; its name is still Preview.
