# The editor

How the editor behaves and why. The code is `apps/web/src/client/components/editor/` and the route `routes/_app/new.tsx`. [`DECISIONS.md`](../DECISIONS.md), under "Creating a Holler", records what the editor offers; this page records how the code keeps those promises.

## One route, from start screen to draft

`/new` shows the start screen. A mode (`?mode=`) or a template (`?template=`) opens the writing page, and a saved draft opens at `/new?draft=<id>`. `?stage=send` is the sending page. Moving between the two pushes a history entry, so the browser's Back returns to the other page. The first save adds `draft` to the address without remounting, so the sender keeps typing through it. `startedHere` stops the route from loading a draft it just made. `/hollers/<id>` sends the creator of a draft or a scheduled Holler here, because that is where it is written.

The audience names a saved draft opens with are looked up once, when it opens. Autosave changes the cached Holler but not that lookup, and only the first load shows the skeleton, so the editor is never swapped out mid-edit.

A template fills the editor and leaves no link behind: from then on it is an ordinary draft. The start screen shows six templates people reach for most; the rest are in the templates dialog.

`ModePicker` shows Pulse but disables it while the draft has more questions than a pulse may ask (`questionLimits`).

## Two pages, no stepper

`HollerEditor` holds the state (`useHollerEditor`) and shows one of two pages: `HollerEditorWrite` or `HollerEditorSend`. `HollerEditorTop` draws the same row on the start screen and both pages, so the back link never moves: on the start screen and the writing page it goes to Your hollers, on the sending page back to the questions (or the form, for a chase). Delete draft sits in that row's menu.

The writing page has no visible title of its own; its `h1` is visually hidden ("Write a survey"), and the Holler's title field is the largest text. A pulse's title field shows its first question in grey, the title it gets when the sender types none. Every mode has an optional description under its title.

The sending page reads top to bottom: `AudiencePicker`, then `SendSettings`, which shows every setting as a row, when it sends first. A new setting is one more row.

## Autosave

`useAutosave` saves a moment (`WAIT_MS`) after the last change, one save at a time, and retries on its own after `RETRY_MS` when a save fails. An untouched new Holler (`isBlank`) makes no draft.

- **The tab is hidden.** The visibility handler sends one last save through `beacon`, a `keepalive` request that finishes after the tab is gone.
- **The sender leaves by a link in the app.** A client-side navigation keeps the page visible, so the visibility save never fires. The unmount cleanup saves what is left instead. It waits a microtask first, because React's development double mount unmounts and mounts again at once.
- **A save lands after the editor is gone.** `apiIo` invalidates Home's lists, so Home shows the new draft.
- **A scheduled Holler.** Its edits wait for **Update schedule**, so autosave is off and leaving drops them on purpose.

`adoptIds` takes the ids the server made for new questions and options without undoing anything typed while the save was on its way. `toPayload` sends every field the server saves, because one left out goes back to its default: a pulse's `repeat` has no control in the editor and still survives a save. It sends no questions for a chase. A draft's `closesAt` is the close the sender fixed; a sent Holler's is its real one.

## The send bar

The bar sits at the bottom of the window. It stays in the page's flow, so it never covers the last row, and on a short page the editor fills the window so the bar still sits at the bottom. It is a raised plate only while content scrolls under it; resting at the end it is a flat row under a hairline. `SendBarAnsweredIn` names where people answer, with a question mark whose popover says why (`webReason` for the web page). Its plum button names what a press does and who it reaches; with nobody chosen it reads **Send**. On a phone the button takes its own line before the words are cut short.

`isBigSend` asks once more before sending to everyone, to more than `bigSendAbove` (50) people, or to a group of unknown size, which could be any size. The question follows the audience on screen, never the last save's problems, which can be stale. `useNow` gives the bar and `SendSettings` one clock, so the close time each prints is the same minute.

## Who: the audience field

`AudiencePicker` works like Slack's To field: type, pick, and the name becomes a chip.

- The directory loads when the field is first used, not on page load. `useDirectory` searches once typing pauses and keeps the last list while the next loads. Each search function gets its own query key, so two design-site demos never share results.
- `seen` keeps every entry the picker has shown, so a chip keeps its name and size after the search moves on.
- Groups come first in the field, then people, and Undo puts a removed chip back in that order.
- Everyone already holds every person, so a pick after Everyone narrows the audience to that pick. `asksForEveryone` puts Everyone first once two letters or more start its name; one letter starts too many names.
- After a search the list steps aside for the next name. While browsing with nothing typed, it stays open.
- The count is exact. Holler stores only each group's size, so once a user group, a channel or Everyone is in the audience, `useAudienceCount` posts it to `POST /api/directory/reach`, which asks Slack who is in each group and counts each person once, however many ways they were chosen. The answer also says how many people are in each time zone, so the time-zone preview counts people inside groups too. People picked only by name are counted in the browser with no request.
- While that count loads, or when Slack does not answer, the picker adds up the group sizes and says **About**, and so does the send button; the guard `the-send-button-never-claims-an-exact-count` holds the button to it. The status line that announces a change waits for the exact count before it speaks.

**Pasting.** `parsePastedList` splits a list on lines, commas, semicolons or tabs; handles, channels and emails also split on spaces. One name is a search. One email is a list of one, because the search does not read emails. Pasting into a name half typed is part of that name.

**Keys.** `fieldKeyAction` and `chipKeyAction` hold the keyboard contract, and `e2e/audience.spec.ts` drives it. Escape never clears the chips. Enter with the list closed adds nothing hidden. Tab or a comma commits the highlighted row, and Cmd or Ctrl Z in an empty field undoes the last removal. Backspace or Left from an empty field reaches the last chip; on a chip, Backspace or Delete removes it, Left and Right walk the chips, and a letter moves focus back to the field before it lands, so it is typed there. A chip's remove button is out of the tab order, as in Slack.

**Base UI.** The list sits under the field instead of in Base UI's popup, because the popup hides the rest of the page from screen readers. It stays mounted while closed, so the field's `aria-controls` always names a list. A press on a row already in the field reads as a removal to Base UI; the picker keeps it in.

## When and how: send settings

In `SendSettings` **Send later** starts at the next working morning (`tomorrowMorning`). Each setting is a row whose whole line is the button, with an action word that says what a press does. **Change** opens one row at a time, so the defaults need no clicks. An open row grows to its content's own height, and nothing inside a shut row can be reached.

- **The sender's clock.** It is the sender's Slack time zone, which `/api/me` returns, because delivery reads a send time there (`senderZoneFor`). Only when Slack has no zone for them does the editor use the browser's.
- **Sending in each person's own time.** `landingTimes` reads `sendAt` as a wall-clock time on the sender's clock and finds that time in each zone, with the conversion delivery uses (`sameWallClockIn`), so the preview and the send agree. A person with no time zone in Slack counts as UTC, as in delivery. Times at one moment sort west to east, so the local times read in clock order. `atWallClock` corrects twice, so a time either side of a daylight-saving change lands on the right hour, and a time the change skips moves forward.
- **The browser's clock.** The date and time pickers read and write the browser's clock, so `toPicker` and `fromPicker` carry a time across from the sender's zone.
- **Close.** A close time the sender fixed is kept when it sends; otherwise it closes `closeAfterHours` after the last person gets it. `durationLabel` also reads well for a `closeAfterHours` the API set that `closePresets` does not offer.
- **Reminders.** `remindersBeforeClose` counts the rhythm. A reminder never lands in the last two hours, and working hours can move one a little later, so the real slots can differ.
- **Anonymous.** `anonymousWarning` warns when the audience is smaller than the five responses anonymous results need. It says nothing while nobody is chosen.

## Date and time input

`DateTimeInput` uses the browser's own date box, which every keyboard, screen reader and phone knows, and Holler's own time list, because the browser's time box paints its parts in the system's colours. A half-cleared day keeps the last whole value. The time list opens on the chosen time, and a chosen time off the steps keeps its row. Enter takes a row only once something is typed, so it never picks midnight by accident. The `Field` around the input names the day box, and the time list has its own label.

## The Slack preview

`SlackPreview` draws the shape of the messages in Holler's neutrals, never Slack's brand, because Slack draws its own messages. The shape follows where it is answered: buttons in the DM, a modal's radios or checkboxes up to 10 and a menu above that, as [docs/slack.md](slack.md) describes. The controls are the same on the invite and every reminder, as delivery builds them. It opens as a dialog on a desktop and a sheet on a phone.
