# Holler: decisions so far

Last updated: 2026-11-21. The stack is in docs/stack.md.

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

Decided on 2026-11-21; Starting and Editor shape changed on 2026-11-27. The editor starts from Tally's builder (`apps/kateryna/tally` in internal-tools) and goes further. The agreed mockups are [`docs/design/editor-flow.html`](docs/design/editor-flow.html) for the flow and [`docs/design/editor-mockup.html`](docs/design/editor-mockup.html) for the question cards; where they and this table differ, this table wins.

| Question | Decision | Rejected |
| --- | --- | --- |
| Where it is answered | Slack first. An extra that Slack cannot show (a follow-up only after certain answers) may send people to the web form, and the editor says so before sending | Slack only, dropping such extras; Tally's silent fallback |
| New question types | Custom scales (any range up to 0–10, words at each end), person picker, number | Date options (a multiple-choice question with dates as options does the job); ranking, matrix grids, logic jumps |
| Question extras | Hint line, Other write-in, pick limit, follow-up note | |
| Answering in the DM | A pulse with one single-choice question shows its options as buttons in the DM. A tap records the answer, and the DM then offers an optional note in a text box. A pulse of one free-text question takes the answer in a box in the DM | A modal for every pulse; notes as thread replies, which need `im:history` |
| Mode | Can change while a Holler is a draft. A third question on a pulse offers to make it a survey | Fixed once chosen |
| Starting | **New holler** opens a start screen, "What do you want to ask?". The three modes are rows in one plate, each with a small drawing of what lands in Slack and one plain line: how people answer and what it suits. Six templates sit below it with **See all**. Hovering a row tints only its drawing, so a grey drawing never sits on a pink row. One click opens the editor in that mode or filled from that template. Opening a draft skips the start screen. Copying lives on the Holler itself as **Copy into a new draft** | Mode cards side by side (2026-11-21 to 2026-11-27); every template listed under its mode with Blank first; no start screen, with the mode as a segmented control in the editor; mode chosen inside Write on every visit |
| Editor shape | Two pages after the start: one to write the Holler and one to send it. No stepper: each page's title and back link say where you are, and the back link keeps its place on every page. The writing page shows the mode as a small button above the title (its glyph, its name and a chevron) whose menu explains each mode; its bar offers **Next: share**. The sending page is titled with what it sends, "Send "Retro"", and has two sections: who gets it, and settings, one row each for when it sends, close time, answers, reminders, live count and tags. Sends reads Now until Send later opens its day and time in the row, with a box to send in each person's own time zone. A new send option is one more row there. Every mode, a pulse included, has an optional description under its title. The bar sits at the bottom of the window, on a short page too. It looks raised only while content scrolls under it; resting at the end it is a flat row under a hairline. It names where people answer with an icon and a short label (Slack DM, Slack form, Web page, Your form) and a question mark that says why; Slack's own mark marks the two Slack places. A pulse's title is edited like any other, and shows its first question until one is typed. **Preview** opens what people see in Slack from the bar on both pages. Templates open in a dialog. **Delete draft** is in the draft's menu | A numbered Compose and Send stepper (2026-11-21 to 2026-11-27); settings as pills above the questions; a plan column beside the questions; sending in a sheet over the writing; the settings told as a paragraph; the mode as a segmented control; "New survey" as the page title with the mode picker in it; Delete draft as a button in the header |
| Names and icons | The third mode is **Chase** (was Form chase), shown with a running figure | A link-out icon; a ticked clipboard |
| Question cards | All open, as in Tally. The drag handle sits beside the number. Description, Other, Duplicate and Delete live in the card's menu. Other sits on white like every option. An empty question offers its types first; templates are a quiet link | Folding cards to one line; a grey Other row; a prominent template button in the empty question |
| Close time | 1 day, 3 days or 1 week after sending, or a fixed date and time | Relative only |
| Editing a scheduled Holler | Edits wait for **Update schedule**, so a half-finished edit never goes out | Editing pauses the schedule; edits saved live |
| Sending | The button names the reach. Sending to everyone or to more than 50 people asks once more | Always confirming; never confirming |
| Anonymity | The sender sees how many answered, never who. Results stay live once 5 people answered. Holler still reminds people itself | Showing who answered beside live results, which lets a sender match an answer to a person; sealing results until close |
| AI drafting | Not in the editor. Assistants create hollers over MCP | A "Draft it for me" box |
| Repeating pulses | A pulse repeats every week or every fortnight, on the day and time its first round goes out. Each round is its own Holler with its own results; the next round is scheduled when one goes out, so it shows under Scheduled and can be edited on its own. Each round closes before the next. Stopping deletes the next round and keeps every answer | Monthly and custom rules; one Holler collecting every round's answers; skipping single rounds |

## Still open

- **Trademark.** No search is done. A US company named Holler made stickers and GIFs
  for messaging apps. Check before money goes into the logo.
- **Slack Marketplace.** No name check is done.
- **Domain purchase.** Not bought.
- **Screens.** Only the home screen exists in the final brand. Results and editor still
  need a version.
- **Teams.** Teams needs a separate bot. The suggestion was to leave it out of the first
  version. This is not decided.
- **Copyright holder.** LICENSE names Kateryna Porshnieva. Swap in the OÜ's legal name.
