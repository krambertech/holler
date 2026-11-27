# Holler: decisions so far

Last updated: 2026-11-27. The stack is in docs/stack.md.

Holler is a public product based on Tally, the internal Buffer tool. You ask your team
something in Slack, Holler reminds the people who have not answered, and you read the
results. It covers surveys, pulse checks, and form chasing, and it has an MCP server.

This file records what is decided, what was rejected, and what is still open. The
mockups for every round are on one canvas:
[Holler directions](https://claude.ai/artifact/JygoSbzdb9vUx6dehbjEVP). The canvas is
private until it is shared from its Share menu.

## Decided

| Area        | Decision                                                           |
| ----------- | ------------------------------------------------------------------ |
| Name        | Holler                                                             |
| Domain      | `holler.team`                                                      |
| Logo        | The calling h: the letter h with two sound lines, in a plum square |
| Main colour | Plum `#7A2A68`, with pink as the highlight                         |
| Font        | Geologica, set light                                               |
| Surfaces    | Warm canvas with white rounded plates                              |
| Layout      | Tally's layout: one column, no sidebar                             |
| Voice       | Plain words. "Holler" is only a noun                               |
| Sign-in     | Sign in with Slack only. Recipients never sign in                  |
| Billing     | Polar, as merchant of record, on the Estonian OÜ                   |
| Plans       | Free: 5 hollers a month. Team: $12 a month or $120 a year          |
| Access      | Open sign-in for everyone in an installed workspace                |
| Licence     | Public source, all rights reserved                                 |
| Node        | 24                                                                 |

## Token review: 21 November 2026

Round 4 on the canvas reopened the tokens before the design system is built on them. The brief is in `docs/design/system-brief.md`.

| Question | Decision | Rejected |
| --- | --- | --- |
| Canvas temperature | A: warm off-white, as before | Neutral; tinted toward plum |
| Type scale | 1.125 from 15 px; body 300 by day, 330 at night (350 read thick once Geologica loaded) | The mockup's sizes; 1.2; 300 with heavier captions and night text |
| Radii | Plates 16, controls 10, glyphs 9, chips pills | 22 and 13; 12 and 8 |
| Pink | Plum by day, soft pink at night, and pink marks what is live | Pink in the logo only; plum at night |
| Overlays | Plates flat; floating layers get the hairline and one soft shadow | Hairline only; tinted layers |

These supersede the plate and control radii, the 300 body weight and "pink only for marks" in the sections below.

## Name: Holler

The name had to work in the sentence people already say at work: "send me a Holler".
It also carries the reminder idea. You holler again when nobody answers.

- "Tally" is not available. tally.so is a form builder with its own Slack app.
- Yoyo was the runner-up. Its short domains were premium, at $65 a year and up.
- Slip, Muster, and the invented names were rejected.

## Domain: holler.team

Porkbun prices on 2026-11-20. These are not purchases. Nothing is bought yet.

| Domain           | First year | Renews at |
| ---------------- | ---------- | --------- |
| `holler.team`    | $4.63      | $32.44    |
| `sendholler.com` | $11.81     | $11.81    |
| `sendholler.app` | $8.75      | $14.93    |

`sendholler.com` is worth adding for email and as a backup. `holler.com`, `.app`, `.io`,
`.chat`, `.co`, and `.dev` are taken. The owner of `holler.app` asks $15,000.

## Product shape: Tally's UX, kept

Holler keeps the UX decisions that work in Tally. It is a simple tool, so it has no
sidebar.

- One column, with a slim header.
- Home shows three numbers: live now, people still to answer, scheduled.
- Tabs for **Mine** and **Shared with me**.
- Rows grouped as **Live**, **Scheduled**, and **Closed**.
- The detail page shows the answered count, the people, the results, and the export.

Rejected layouts: a left rail, and a top bar with a filter side panel and a people table.
Both looked like a generic SaaS dashboard.

## Look: warm canvas, white plates

The look borrows one thing from Lymi: a warm off-white page with white rounded plates.

- Rows that belong together share one plate, with a hairline between them.
- A tinted strip can close a plate, for example "9 people still to answer".
- Plates have a 22 px radius. Controls have 13 px. Chips are pills.
- Depth is one hairline edge. There are no drop shadows.
- Icons are 2 px line icons with round ends.

**The theme lives in the logo, not in the interface.** The first round put the theme
everywhere: speech-bubble corners, hills, a loudspeaker block, a dark radio screen. All
four looked cartoonish and not like a proper tool.

## Logo: the calling h

The mark is a lowercase h with two pink sound lines at its top right. It sits in a plum
square with rounded corners, so the same shape is the app icon and the Slack bot avatar.

- The wordmark is lowercase "holler" in Geologica 600.
- The sound lines are soft pink `#F29BD0` on plum.
- Rejected marks: a megaphone, a message with its reply, and an o drawn as an open mouth.

The current mark is a hand-drawn SVG draft. It needs a proper drawing pass.

## Colour: plum to act, pink to call out

Most of a screen is warm neutral. Plum marks the one main action and what is live. Pink
is for the logo's sound lines and small highlights.

| Token       | Hex       | Use                                          |
| ----------- | --------- | -------------------------------------------- |
| Plum        | `#7A2A68` | Main button, live state, logo, bars          |
| Deep plum   | `#3D1233` | Text on soft pink, darkest chart step        |
| Holler pink | `#D9499A` | Marks and large type only                    |
| Soft pink   | `#F29BD0` | Sound lines, main colour at night            |
| Tint        | `#F4E1EF` | Under chips, count pills, the reminder strip |
| Tint ink    | `#5C1C4E` | Text on tint                                 |
| Canvas      | `#F8F6F4` | The page                                     |
| Plate       | `#FFFFFF` | Cards and row groups                         |
| Well        | `#F2F0EC` | Tracks, quiet chips                          |
| Edge        | `#E6E2DE` | Hairlines                                    |
| Muted       | `#6B5F58` | Secondary text                               |
| Text 2      | `#49403A` | Supporting text                              |
| Ink         | `#1C140F` | Main text                                    |

Rules:

- One plum button on a screen. Every other button is white with a hairline.
- Holler pink never carries body text. White on it is about 3.4 to 1.
- White on plum is about 9 to 1.
- Status always has a word next to the colour: Live, Answered, Waiting, Away, Closed.
- A chart ramp runs from deep plum to pale pink: `#3D1233`, `#7A2A68`, `#B04A93`,
  `#E08CC4`, `#F4CFE6`.
- At night, soft pink takes plum's job, with deep plum text on it. Night canvas is
  `#171115` and night plate is `#231A21`.

Rejected colours: tomato, ink with yellow, green, and cobalt blue. Tally's red stays with
Tally.

## Type: Geologica, set light

One family, Geologica. It is free on Google Fonts, variable, and has Latin and Cyrillic.

Geologica first looked cartoonish. The cause was the weights, not the font: almost every
piece of text sat between 400 and 600. The fix is a weight ladder.

| Weight | Use                        |
| ------ | -------------------------- |
| 300    | Body text and captions     |
| 400    | Titles, names, and numbers |
| 500    | Buttons only               |
| 600    | The wordmark only          |

- Never use 700.
- Size makes the hierarchy. Weight only separates a name from the text around it.
- Titles tighten to -0.025em.
- Sentence case everywhere. No all caps.

Onest and Hanken Grotesk were the other two candidates. Onest is Lymi's font, so Holler
would have shared it.

## Voice: plain, warm, brief

Holler talks like a helpful colleague in Slack. The name is the only playful word.

| Say                    | Do not say            |
| ---------------------- | --------------------- |
| 7 of 12 answered       | 7 hollered back       |
| Waiting on 5 people    | Radio silence         |
| Send reminder          | Holler again          |
| New holler             | Create survey         |
| Closes Friday at 18:00 | Deadline approaching! |

- "Holler" is a noun: a Holler, your hollers. It is never a verb in the interface.
- Capital H for the product and in Slack. Lowercase in the wordmark.
- No exclamation marks. No emoji in the product.

## Plans: Free and Team

Decided on 2026-11-21. Running Holler costs about $5 a month on Cloudflare plus roughly
$0.02 per 1,000 recipients, so the limit only decides when a workspace has a reason to
pay. Polar takes 4% + 40¢ per payment, which is why the yearly price exists.

- **Free.** 5 hollers a month, to any number of recipients.
- **Team.** $12 a month or $120 a year per workspace. No monthly limit.
- **Later.** A tier for bigger companies, holding access controls and whatever else they
  ask for. Not in the first version.
- Rejected: tiers by workspace size, by recipients per Holler, and by people reached in a
  month. Each priced bigger companies higher, and none was worth the complexity at $12.

## Access: open sign-in, two roles

Decided on 2026-11-21.

- Anyone in a workspace that installed Holler can sign in and send. There is no approval
  and no removing a member in the first version; both belong to the later tier.
- Two roles: owner and sender. The installer is an owner. Owners can make another member
  an owner or a sender. The last owner cannot stop being one.
- A reinstall replaces the bot. The person who reinstalls becomes an owner only when the
  workspace has no owner left.
- Someone whose workspace has not installed Holler sees **Add to Slack**, with one line on
  what to do if Slack asks for an admin's approval.
- Enterprise Grid installs are refused for now.
- When Slack reports an uninstall, sending pauses and every page says so. Owners see
  **Reinstall**. Drafts and results stay.
- Holler deletes an uninstalled workspace's data 90 days after Slack reports the uninstall, unless someone adds Holler again first, and never while the workspace still pays for Team. Every page says the date. Decided on 2026-11-21.
- An owner can delete the workspace's data at any time from the last section of Settings, after typing the workspace's name. Holler then leaves Slack. A workspace that still pays for Team cancels first. Decided on 2026-11-21.
- The audience picker offers people, user groups, public channels, and private channels
  Holler's bot was added to.
- Settings is one scrolling page. Billing and API keys are sections on it.

## Creating a Holler

Decided on 2026-11-21; Starting, Editor shape and Sending changed on 2026-11-27. The editor starts from Tally's builder (`apps/kateryna/tally` in internal-tools) and goes further. The agreed mockups are [`docs/design/send-flow.html`](docs/design/send-flow.html) for the page and its send dialogs (layout B), [`docs/design/editor-flow.html`](docs/design/editor-flow.html) for the start screen and [`docs/design/editor-mockup.html`](docs/design/editor-mockup.html) for the question cards; where they and this table differ, this table wins.

| Question | Decision | Rejected |
| --- | --- | --- |
| Where it is answered | Slack first. An extra that Slack cannot show (a follow-up only after certain answers) may send people to the web form, and the editor says so before sending | Slack only, dropping such extras; Tally's silent fallback |
| New question types | Custom scales (any range up to 0–10, words at each end), person picker, number | Date options (a multiple-choice question with dates as options does the job); ranking, matrix grids, logic jumps |
| Question extras | Hint line, Other write-in, pick limit, follow-up note | |
| Answering in the DM | A pulse with one single-choice question shows its options as buttons in the DM. A tap records the answer, and the DM then offers an optional note in a text box. A pulse of one free-text question takes the answer in a box in the DM | A modal for every pulse; notes as thread replies, which need `im:history` |
| Mode | Can change while a Holler is a draft. A third question on a pulse offers to make it a survey | Fixed once chosen |
| Starting | **New holler** opens a start screen, "What do you want to ask?". The three modes are rows in one plate, each with a small drawing of what lands in Slack and one plain line: how people answer and what it suits. Six templates sit below it with **See all**. Hovering a row tints only its drawing, so a grey drawing never sits on a pink row. One click opens the editor in that mode or filled from that template. Opening a draft skips the start screen. Copying lives on the Holler itself as **Duplicate**, which opens the copy as a new draft | Mode cards side by side (2026-11-21 to 2026-11-27); every template listed under its mode with Blank first; no start screen, with the mode as a segmented control in the editor; mode chosen inside Write on every visit |
| Editor shape | One page after the start. The top row has a back arrow and the mode written as what you are making, **New survey** with a chevron, whose menu explains each mode. Under it, one card like an email's To line: who gets it as chips, and a strip with how many it reaches and an **Anonymous** switch. Away from the field, many chips fold to one line ending in "+N more", and a click opens them again. Then the title, an optional description in every mode, and the questions. The bar sits at the bottom of the window, on a short page too; it looks raised only while content scrolls under it, and rests as a flat row with no line above it. It names where people answer with an icon and a short label (Slack DM, Slack form, Web page, Your form) and a question mark that says why; Slack's own mark marks the two Slack places. Its plum button is **Send**, with an arrow for **Schedule…**. Each opens a dialog titled with the Holler's name and who it reaches, with a switch for reminders, a choice of when it closes and a switch for a live count; Schedule adds the day and time, picked from a calendar and a list, and whose clock, with the time in each zone behind a link. A new send option is one more row in that dialog. A pulse's title is edited like any other, and shows its first question until one is typed. **Preview** sits beside Send. Templates open in a dialog. **Tags** and **Delete draft** are in the draft's menu | A numbered Compose and Send stepper (2026-11-21 to 2026-11-27); a second page to send, with every setting as a row (2026-11-27); settings as pills above the questions; a plan column beside the questions; the settings told as a paragraph; the mode as a segmented control; the mode as a labelled row in the To card; Named and Anonymous as a menu; Delete draft as a button in the header |
| Names and icons | The third mode is **Chase** (was Form chase), shown with a running figure | A link-out icon; a ticked clipboard |
| Question cards | All open, as in Tally. The drag handle sits beside the number. Description, Other, Duplicate and Delete live in the card's menu. Other sits on white like every option. An empty question offers its types first; templates are a quiet link | Folding cards to one line; a grey Other row; a prominent template button in the empty question |
| Close time | 1 day, 3 days or 1 week after sending, or a fixed date and time | Relative only |
| Editing a scheduled Holler | Edits wait for **Update schedule**, so a half-finished edit never goes out | Editing pauses the schedule; edits saved live |
| Sending | Every send asks once, in the send dialog, and its button names the reach | Asking only for everyone or more than 50 people (2026-11-21 to 2026-11-27); never confirming |
| Anonymity | The sender sees how many answered, never who. Results stay live once 5 people answered. Holler still reminds people itself | Showing who answered beside live results, which lets a sender match an answer to a person; sealing results until close |
| AI drafting | Not in the editor. Assistants create hollers over MCP | A "Draft it for me" box |
| Repeating pulses | A pulse repeats every week or every fortnight, on the day and time its first round goes out. Each round is its own Holler with its own results; the next round is scheduled when one goes out, so it shows under Scheduled and can be edited on its own. Each round closes before the next. Stopping deletes the next round and keeps every answer | Monthly and custom rules; one Holler collecting every round's answers; skipping single rounds |

## A Holler's page

Decided on 2026-11-27. The agreed mockup is [`docs/design/holler-page.html`](docs/design/holler-page.html); where it and this table differ, this table wins.

| Question | Decision | Rejected |
| --- | --- | --- |
| Order | Chase, then read: the people first, then the results | Results and People as two tabs; an overview with one folded row per question |
| People | The count with a few faces above a full-width bar. Up to five people still to chase by name, then one row for everyone who answered, and Show everyone. A closed Holler names who did not answer. Send reminder, with a bell, sits on the strip under them | Every person listed, folded at eight |
| Actions | Share, Export and the menu sit beside the title; on a phone, in a row under it | In the back link's row |
| Questions | One plate each, headed like the editor's card: the number in a grey square, the question, its type with its icon, and the count in the corner. The type says enough: no line explaining that a multiple choice can add past 100% | A type line without separators; the count in the type line on a wide screen |
| Charts | One row per answer in one colour, for choices, scales, yes or no, people and numbers. A scale leads with its average and writes its end words beside the first and last step. A number leads with its average, median, lowest and highest, then a row per value, or per range when the values spread wide | A scale as one bar split by step on the plum ramp, with a legend; a number as a dot plot; a yes or no as one split bar |
| Written answers | The answer first, signed under it with a small avatar and the name. Notes and Other write-ins sit in a quiet panel under the bars | The avatar beside the answer with the name above it; notes under a plain heading |
| Your answers | In the account menu, above Settings | A link in the header |
| Rounds | A repeating pulse's rounds sit in a plate with the repeat icon, after the people. The creator gets **Edit next round**, which opens the scheduled round in the editor; changing how often it repeats is not built yet. Every round but this one opens with a chevron, and this round's bar sits on white so it reads on the tint | A grey bar on the tinted row; editing only through the round's own row |
| Copying | **Duplicate** in the Holler's menu, the same word the editor uses for a question | Copy into a new draft |

## Still open

- **Trademark.** No search is done. A US company named Holler made stickers and GIFs
  for messaging apps. Check before money goes into the logo.
- **Slack Marketplace.** No name check is done.
- **Domain purchase.** Not bought.
- **Screens.** Home, the editor and a Holler's page are in the final brand. The rest still
  need a version.
- **Teams.** Teams needs a separate bot. The suggestion was to leave it out of the first
  version. This is not decided.
- **Copyright holder.** LICENSE names Kateryna Porshnieva. Swap in the OÜ's legal name.
