# The editor

How the editor behaves and why. The code is `apps/web/src/client/components/editor/` and the route `routes/_app/new.tsx`. [`DECISIONS.md`](../DECISIONS.md), under "Creating a Holler", records what the editor offers; this page records how the code keeps those promises.

## One route, from start screen to draft

`/new` shows the start screen. A mode (`?mode=`) or a template (`?template=`) opens the editor, and a saved draft opens at `/new?draft=<id>`. The first save adds `draft` to the address without remounting, so the sender keeps typing through it. `startedHere` stops the route from loading a draft it just made. `/hollers/<id>` sends the creator of a draft or a scheduled Holler here, because that is where it is written.

The audience names a saved draft opens with are looked up once, when it opens. Autosave changes the cached Holler but not that lookup, and only the first load shows the skeleton, so the editor is never swapped out mid-edit.

A template fills the editor and leaves no link behind: from then on it is an ordinary draft. The start screen shows six templates people reach for most; the rest are in the templates dialog.

`ModePicker` shows Pulse but disables it while the draft has more questions than a pulse may ask (`questionLimits`).

## One page

`HollerEditor` holds the state (`useHollerEditor`) and draws one page. `HollerEditorTop` is the top row on the start screen and in the editor: a back arrow to Your hollers, then "New holler" on the start screen or `ModePicker` ("New survey" with a chevron) in the editor, and on the right the save status and the draft's menu with Tags (`HollerEditorTags`) and Delete draft.

Under the top row, `AudiencePicker` is the To card, and `HollerEditorWrite` holds the title, the description and the questions. The page has no visible title of its own; its `h1` is visually hidden ("Write a survey"), and the Holler's title field is the largest text. A pulse's title field shows its first question in grey, the title it gets when the sender types none.

## Autosave

`useAutosave` saves a moment (`WAIT_MS`) after the last change, one save at a time, and retries on its own after `RETRY_MS` when a save fails. An untouched new Holler (`isBlank`) makes no draft.

- **The tab is hidden.** The visibility handler sends one last save through `beacon`, a `keepalive` request that finishes after the tab is gone.
- **The sender leaves by a link in the app.** A client-side navigation keeps the page visible, so the visibility save never fires. The unmount cleanup saves what is left instead. It waits a microtask first, because React's development double mount unmounts and mounts again at once.
- **A save lands after the editor is gone.** `apiIo` invalidates Home's lists, so Home shows the new draft.
- **A scheduled Holler.** Its edits wait for **Update schedule**, so autosave is off and leaving drops them on purpose.

`adoptIds` takes the ids the server made for new questions and options without undoing anything typed while the save was on its way. `toPayload` sends every field the server saves, because one left out goes back to its default: a pulse's `repeat` has no control in the editor and still survives a save. It sends no questions for a chase. A draft's `closesAt` is the close the sender fixed; a sent Holler's is its real one.

## The send bar and the send dialog

The bar sits at the bottom of the window. It stays in the page's flow, so it never covers the last row, and on a short page the editor fills the window so the bar still sits at the bottom. It is a raised plate only while content scrolls under it; resting at the end it is a flat row under a hairline. `SendBarAnsweredIn` names where people answer, with a question mark whose popover says why (`webReason` for the web page). A problem from the last send takes its place, until the sender fixes it.

`SendSplit` is the one plum button: **Send**, with an arrow whose menu offers **Schedule…**. Once a Holler is scheduled it reads **Update schedule**, and the arrow offers **Change the time** and **Send now instead**. Every choice opens `SendDialog`, which works on its own copy of the send fields, so Cancel keeps nothing. Its button names the reach (`sendActionLabel`), approximate once groups are in it.

Confirming hands the dialog's fields to `send`, which saves them with the draft in one flush (`useAutosave`'s `flush(next)`), so the save never misses the last change. A problem with the send time or close time keeps the dialog open beside its row; any other problem closes it and shows beside its field on the page, with the first in the bar. `useNow` gives the bar and the dialog one clock, so the close time each prints is the same minute.

## Who: the audience field

`AudiencePicker` works like Slack's To field: type, pick, and the name becomes a chip. Its footer says how many it reaches and holds the Anonymous switch; `anonymousWarning` adds a strip under it when the audience is too small for anonymous results.

- Away from the field, the chips fold to one line ending in "+N more" (`useChipOverflow`). The chips keep their wrapped layout and only the frame's height changes, so nothing moves under a click that opens it. Chips past the fold stay in the list for screen readers, and the text box is visually hidden but still takes focus, which opens the field.

- The directory loads when the field is first used, not on page load. `useDirectory` searches once typing pauses and keeps the last list while the next loads. Each search function gets its own query key, so two design-site demos never share results.
- `seen` keeps every entry the picker has shown, so a chip keeps its name and size after the search moves on.
- Groups come first in the field, then people, and Undo puts a removed chip back in that order.
- Everyone already holds every person, so a pick after Everyone narrows the audience to that pick. `asksForEveryone` puts Everyone first once two letters or more start its name; one letter starts too many names.
- After a search the list steps aside for the next name. While browsing with nothing typed, it stays open.
- The reach is approximate once groups are in it, because groups can overlap. The time-zone preview counts only people picked by name: members of groups are not known until it sends.

**Pasting.** `parsePastedList` splits a list on lines, commas, semicolons or tabs; handles, channels and emails also split on spaces. One name is a search. One email is a list of one, because the search does not read emails. Pasting into a name half typed is part of that name.

**Keys.** `fieldKeyAction` and `chipKeyAction` hold the keyboard contract, and `e2e/audience.spec.ts` drives it. Escape never clears the chips. Enter with the list closed adds nothing hidden. Tab or a comma commits the highlighted row, and Cmd or Ctrl Z in an empty field undoes the last removal. Backspace or Left from an empty field reaches the last chip; on a chip, Backspace or Delete removes it, Left and Right walk the chips, and a letter moves focus back to the field before it lands, so it is typed there. A chip's remove button is out of the tab order, as in Slack.

**Base UI.** The list sits under the field instead of in Base UI's popup, because the popup hides the rest of the page from screen readers. It stays mounted while closed, so the field's `aria-controls` always names a list. A press on a row already in the field reads as a removal to Base UI; the picker keeps it in.

## When and how: the dialog's settings

**Schedule…** starts at the next working morning (`tomorrowMorning`) when nothing is scheduled. Reminders and Live count are switches, Closes is a choice of presets or a day you pick, and a live count asks for its channel before it can be confirmed.

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
