# Make a Holler

The editor: the start screen, then one page with who gets it at the top, the title and questions under it, and a Send button whose dialog asks the last questions. It saves as the sender types.

## Reach

**New holler** on Home, which opens `/new`. A saved draft opens at `/new?draft=<id>`; `/hollers/<id>` sends a draft there.

## Drive

[`editor.mjs`](editor.mjs) as `lead`: pick Survey on the start screen, check the top row reads **New survey**, write a title and a single-choice question with two options, wait for the draft to save, reload, check the Audience card holds the reach and the Anonymous switch, open **Schedule…** from the arrow beside Send and see the day, time, time zone and the three settings, cancel, then press Send and Send again in its dialog with nobody chosen.

## End state

`/api/dev/state` lists the new draft with its title. After the reload the question and its options are still there. The Audience card says **Nobody yet**. The Schedule dialog shows a Time zone choice, Reminders on and Live count off. Send closes its dialog and names "Choose who to send it to." under the To field, and the draft is still a draft.

## Gotchas

- Autosave waits for the typing to stop, so wait for **Draft saved** before reading the state.
- Sending itself stops at the Slack delivery placeholder (`slack_unavailable`); this recipe proves the problems before it, not a send.
- At 375 px the bar's Preview button shows only its eye, and the dialogs open as sheets from the bottom; their names are the same.
- The bar's Send and the dialog's Send share a name, so the recipe scopes the first to `[data-slot="send-bar"]` and the second to the dialog.
