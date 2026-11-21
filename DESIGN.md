---
name: Holler
description: Ask your team in Slack. A warm canvas, white plates, plum to act, pink to call out.
colors:
  canvas: "#f8f6f4"
  plate: "#ffffff"
  well: "#f2f0ec"
  track: "#eeebe6"
  hover: "#1a15120e"
  edge: "#2013081a"
  edge-2: "#20130824"
  edge-3: "#20130842"
  divider: "#20130814"
  scrim: "#1f111a52"
  ink: "#1c140f"
  ink-2: "#49403a"
  muted: "#6b5f58"
  faint: "#8a7f78"
  primary: "#7a2a68"
  primary-hover: "#692059"
  on-primary: "#ffffff"
  tint: "#f4e1ef"
  tint-ink: "#5c1c4e"
  focus: "#7a2a68"
  plum: "#7a2a68"
  deep-plum: "#3d1233"
  pink: "#d9499a"
  soft-pink: "#f29bd0"
  live: "#fce1ef"
  live-ink: "#822155"
  live-dot: "#d9499a"
  answered: "#ddeedf"
  answered-ink: "#145536"
  answered-dot: "#1f7a4d"
  waiting: "#fbebc8"
  waiting-ink: "#6b4a00"
  waiting-dot: "#b17000"
  away: "#e9ecef"
  away-ink: "#3f4a5a"
  away-dot: "#7c8794"
  closed: "#f2f0ec"
  closed-ink: "#49403a"
  closed-dot: "#6b5f58"
  toast-action: "#f29bd0"
  danger: "#fbe2df"
  danger-ink: "#8e1d17"
  danger-dot: "#b3261e"
  chart-1: "#3d1233"
  chart-2: "#7a2a68"
  chart-3: "#b04a93"
  chart-4: "#e08cc4"
  chart-5: "#f4cfe6"
  avatar-1: "#d7e4fb"
  avatar-1-ink: "#1c3a7a"
  avatar-2: "#fbe1d2"
  avatar-2-ink: "#7a3312"
  avatar-3: "#eadffb"
  avatar-3-ink: "#47208f"
  avatar-4: "#ddeedf"
  avatar-4-ink: "#145536"
  avatar-5: "#ffe9bf"
  avatar-5-ink: "#5a3d00"
  avatar-6: "#fce0e6"
  avatar-6-ink: "#7a1f37"
typography:
  family: Geologica
  weights: { body: 300, title: 400, button: 500, wordmark: 600 }
  scale: 1.125 from 15px
radii: { plate: 16px, control: 10px, glyph: 9px, chip: pill }
---

# Holler design system

The colours above are generated from `packages/design/tokens.css` by `node scripts/check-design.mjs --write`, and `pnpm check:design` fails when they drift. Every component lives on the design site at `design.holler.team` (locally `pnpm --filter @holler/web design:dev`, port 5282): foundations, then one page per component group with every variant in day and night. `pnpm check:design-coverage` fails when an exported component has no entry there. [PRODUCT.md](PRODUCT.md) says who this is for; [DECISIONS.md](DECISIONS.md) records how the brand was chosen and what was rejected.

## Rules every screen follows

1. **One column, no sidebar.** A slim header, then the page, at most 880 px wide. Holler is a small tool and looks like one.
2. **Warm canvas, white plates.** Rows that belong together share one `Plate`, with a hairline between them (`PlateRow`). A tinted `PlateStrip` can close a plate: "9 people still to answer". A plate's depth is one hairline edge: no drop shadows, no gradients. Only what floats over the page (menus, popovers, dialogs, toasts) adds one soft shadow, `shadow-float`.
3. **One plum button per screen.** It is the main action: `Button` with `variant="primary"`. Every other button is white with a hairline. At night soft pink takes plum's job, with deep plum text on it.
4. **Pink means live.** Pink is the voice: the logo's sound lines, and in the interface only what is out and calling right now, the Live chip and its dot (`live`, `live-ink`, `live-dot`). Pink never carries body text, and at night soft pink also takes plum's job.
5. **Status always has a word.** `StatusChip` and `StatusDot` pair a colour with Live, Answered, Waiting, Away, Closed or Not sent. Colour is never the only signal.
6. **Size makes the hierarchy, not weight.** The type scale is 1.125 from 15 px. Body is 300 by day and 330 at night, where light-on-dark reads thinner; titles, names and numbers are 400, buttons 500, the wordmark 600. Nothing is 700. Titles tighten to -0.025em. Sentence case everywhere.
7. **The theme lives in the logo.** No speech-bubble corners, megaphones or sound waves in the interface. The calling h (`Mark`, `Logo`) is the only playful shape.
8. **Line icons.** Lucide at 2 px stroke with round ends, 16 to 18 px. An icon-only button has an `aria-label`.
9. **Tokens only.** Use Tailwind utilities over the tokens: `bg-plate`, `text-ink-2`, `bg-tint text-tint-ink`. A raw hex or a stock Tailwind colour in a component fails `pnpm check:styling`. Use logical directions: `ms-`, `pe-`, `text-start`.
10. **Contrast is tested.** Every text-on-surface pair the interface draws is listed in `packages/design/src/pairs.ts` and checked in both themes by `pnpm --filter @holler/design test`. Add a pair when you put a token's text on a token's surface for the first time.

## Colour

| Role          | Token                                             | Use                                                                         |
| ------------- | ------------------------------------------------- | --------------------------------------------------------------------------- |
| Page          | `canvas`                                          | Behind everything                                                           |
| Surface       | `plate`                                           | Cards and row groups                                                        |
| Quiet surface | `well`, `track`                                   | Quiet chips, closed status, progress tracks, the tab track                  |
| Edges         | `edge`, `edge-2`, `divider`                       | A plate's edge, a control's edge, between rows                              |
| Text          | `ink`, `ink-2`, `muted`                           | Main, supporting, secondary. `faint` is never text                          |
| Action        | `primary`, `primary-hover`, `on-primary`          | The one main button, live, progress                                         |
| Highlight     | `tint`, `tint-ink`                                | Mode glyphs, count pills, the reminder strip                                |
| Brand         | `plum`, `deep-plum`, `pink`, `soft-pink`          | The logo and marks, the same in both themes                                 |
| Status        | `answered`, `waiting`, `away`, `closed`, `danger` | Each with `-ink` and `-dot`                                                 |
| Charts        | `chart-1` to `chart-5`                            | One question's ramp, deep plum to pale pink. A single series uses `chart-2` |
| Avatars       | `avatar-1` to `avatar-6`                          | Initials when Slack has no photo, picked from the Slack id                  |

## Type

A 1.125 scale from 15 px. Body is 300 by day and 330 at night.

| Step | Size | Use |
| --- | --- | --- |
| `text-8xl`, `text-7xl`, `text-6xl` | 80, 60, 44 px | The marketing site only |
| `text-5xl` | 30 px | Site section headings |
| `text-4xl` | 27 px | Every screen's title: "Your hollers", "Sign in to Holler" |
| `text-3xl` | 24 px | The numbers on Home |
| `text-2xl`, `text-xl` | 21, 19 px | Large headings, dialog titles, the wordmark |
| `text-lg` | 17 px | Group and question headings |
| `text-base` | 15 px | Names (400) and body (300) |
| `text-sm`, `text-xs` | 13.5, 12 px | Captions and column labels |

Numbers in tables and counts use `tabular`.

## Components

| Component                         | File                          | Notes                                                                                        |
| --------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------- |
| `Button` | `components/ui/button.tsx` | `primary`, `secondary`, `ghost`; sizes `sm`, `md`, `lg`, `icon-sm`, `icon`; `render` for links; `pending` blocks every further press |
| `Plate`, `PlateRow`, `PlateStrip` | `components/ui/plate.tsx`     | The surface system                                                                           |
| `Chip`, `StatusChip`, `StatusDot` | `components/ui/chip.tsx`      | Pills; a status always has its word                                                          |
| `Avatar`, `AvatarStack`           | `components/ui/avatar.tsx`    | Waiting people are greyed in a stack; the stack carries one `aria-label`                     |
| `ProgressBar`                     | `components/ui/progress.tsx`  | Decorative; the count beside it carries the meaning                                          |
| `Segmented`                       | `components/ui/segmented.tsx` | Base UI tabs on a track: Mine, Shared with me                                                |
| `ModeGlyph`                       | `components/mode-glyph.tsx`   | The mode's icon on a tint tile; quiet once not live                                          |
| `Mark`, `Logo`                    | `components/logo.tsx`         | Geometry from `packages/design/src/index.ts`                                                 |
| `HollerRow`                       | `components/holler-row.tsx`   | Four columns wide, folded on a phone; the whole row is one link                              |
| `AppHeader`                       | `components/app-header.tsx`   | The logo home and the member, who opens Settings                                             |
| `UninstalledNotice`               | `components/uninstalled-notice.tsx` | Top of every page while Holler is out of Slack; owners get Add to Slack again          |
| `MemberRow`, `RoleSelect`         | `components/settings/`        | A member in Settings; owners pick Owner or Sender                                            |
| `WorkspaceIcon`                   | `components/settings/workspace-icon.tsx` | The Slack workspace's icon, or its initials on a tint tile                        |
| `Field`, `Input`, `Textarea` | `components/ui/field.tsx`, `input.tsx`, `textarea.tsx` | One box for every text control; label above, description or error below, wired by context |
| `Checkbox`, `Switch`, `RadioGroup` | `components/ui/` | Checkbox applies on save; Switch acts at once; RadioGroup for a few visible choices |
| `Select`, `Combobox` | `components/ui/select.tsx`, `combobox.tsx` | A list behind a control; a sheet on touch. Combobox when the list needs search |
| `DropdownMenu`, `Popover`, `Tooltip` | `components/ui/` | What floats over the page: plate plus `shadow-float`, growing from the control |
| `Dialog`, `Toast` | `components/ui/dialog.tsx`, `toast.tsx` | Dialog asks before what cannot be undone; anything undoable gets a toast with Undo |
| `EmptyState`, `EmptySection`, `NoResults` | `components/empty-state.tsx` | First use, an empty group, a search that matched nothing |
| `ErrorState`, `Notice`, `Skeleton` | `components/error-state.tsx`, `notice.tsx`, `skeleton.tsx` | A failed load, an inline message, the shape of what is loading |
| `LimitReached`                    | `components/billing/limit-reached.tsx` | Beside Send when a send returns `402`: upgrade for owners, whom to ask for senders |

Every interactive component has default, hover, focus, active, disabled and pending states. Loading is a skeleton in the shape of what loads, never a spinner in the middle of a page. Errors say what happened and what to do, beside the thing at fault.

## Shape and stacking

Plates are 16 px, controls 10 px, mode glyphs 9 px, and chips are pills. A control inset 6 px inside a plate nests cleanly. Stacking uses the scale in `tokens.css`, lowest first: sticky, dropdown, overlay, dialog, toast, tooltip. Never an arbitrary z-index.

## Motion

Transitions are 150 to 250 ms on `--ease-out`. Three exceptions, all on purpose: a menu or popover opens in 140 ms and closes in 100, because it answers a click and must not lag it; a choice mark (a tick, a radio dot) lands with a small spring from `packages/design/src/motion.ts`; and the thank-you after someone sends their answers lands with the `ARRIVE_*` presets there, a larger spring with a ring and a few sparks, then its lines rise in. That is the one moment Holler celebrates, so it plays once, right after the send, and a reload shows the page still. Motion shows a change of state: a bar filling, a row appearing, a sheet opening. Nothing else moves for decoration and nothing plays on page load. Every animation has a reduced-motion version; `useReduceMotion()` is the only way to ask.

## Voice

Plain, warm, brief. Write what happens: "7 of 12 answered", "Waiting on 5 people", "Send reminder", "Closes Friday at 18:00". "Holler" is a noun, never a verb. No exclamation marks and no emoji in the product. Error messages say what failed and what to do next: "We could not send this. Try again." [CONTEXT.md](CONTEXT.md) holds the words to use and the words to avoid.

## Slack

Slack draws the buttons; the brand is the avatar, the name and the words. The bot avatar is the `Mark` at 512 px. Messages put the question first and the context after it, keep emoji out, and set `text` to the question so notifications and screen readers read it. [docs/slack.md](docs/slack.md) has every message.
