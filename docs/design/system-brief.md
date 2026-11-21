# Design system brief

**Status:** Confirmed 21 November 2026. Step 1, the token review, is decided: see DECISIONS.md, Token review. The design site's frame exists (`apps/web/design`, `apps/web/src/client/design`) with foundations and today's components; the remaining primitives, patterns, results and Slack pages are still to build.

## 1. What this is

Holler's design system: tokens, primitives, product components, results charts and Slack message patterns. It is documented on its own site, built from the same components the product ships. Two readers use it. You review and steer it. Agents building features use it to find the right component and its rules instead of inventing one. Checks enforce it, so drift fails a build instead of waiting for review.

## 2. The one job

Someone building a Holler screen finds the right component, sees it in every state in day and night, reads when to use it and when not to, and copies working code, in under a minute.

## 3. Direction

**Colour strategy: Restrained.** Tinted neutrals carry most of every screen. Plum covers 10% or less: the one main action, live, focus. Pink stays in the logo. Charts are the one place a full ramp appears.

**Scene.** A team lead at a laptop between two meetings, office daylight or an evening at home, opening Holler for two minutes to see who still has not answered. Light is the default and night is a real palette, not an inversion.

**Anchors.**

- **Vercel Geist** for how the system is documented: a token page per family, one page per component with every state live, usage rules beside the examples, copyable code.
- **Lymi** for how it feels and how it is kept: warm plates and hairlines, careful copy, rules that fail a check instead of living in a wiki.

**Density.** Calm by default, like the home mockup: 13 px row padding, 14.5 px body. A compact density for people lists and results tables.

## 4. The tokens are reopened

The brand was chosen on the canvas, but the tokens get a proper review before anything builds on them. The review happens on a canvas with two or three real alternatives per question, shown on the same three screens: Home, a Holler's results, and a Slack DM.

| Question | Why it is open |
| --- | --- |
| **Canvas temperature.** Warm off-white (`#F8F6F4`) against a near-neutral or a plum-tinted neutral | A warm cream page is the most common AI-generated look of 2026. It may still be right, but it should win against alternatives, not by default |
| **Type scale.** The current steps against a strict 1.125 or 1.2 ratio | The current sizes came from one mockup, not from a scale |
| **Weights.** 300 body with heavier captions and night text, against 350 everywhere | 300 already needed a patch for captions and dark mode |
| **Radii.** 22 px plates and 13 px controls against a tighter pair | 22 px reads soft; tables and dense lists may want less |
| **Plum and pink roles.** Where pink may appear beyond the logo | Charts, focus and the night primary already lean on pink |
| **Overlays.** How a dialog, menu or toast separates from the page when the rule is "no drop shadows" | Floating layers need some depth; the rule needs an exception or a different answer |

What gets added regardless: a 4 px spacing scale, the two densities, an elevation rule for floating layers, a z-index scale (dropdown, sticky, overlay, dialog, toast, tooltip), motion durations and curves, icon sizes, breakpoints, and chart tokens.

## 5. Scope

Production-ready, the whole system, shipped components, polished until it ships. It is built before any feature work, so features only compose.

Build order:

1. Token review on a canvas, decided with you.
2. Tokens in `packages/design`, with the existing checks extended.
3. Primitives.
4. Product components and patterns.
5. Results charts.
6. Slack message patterns.
7. The design site at `design.holler.team`.

You review after steps 1, 3, 5 and 6.

## 6. Site structure

| Section | Pages |
| --- | --- |
| Foundations | Colour, type, spacing and density, radii and elevation, motion, icons, voice and words, accessibility |
| Brand | The mark, the wordmark, the app icon and Slack avatar, misuse |
| Primitives | One page each (list below) |
| Components | One page each |
| Patterns | Forms and validation, empty, loading and error, lists on plates, tables, overlays, feedback and toasts, confirmation |
| Results | Each chart, with the anonymous gate state |
| Slack | Each message, the answer modal, App Home, `/holler` |

Every component page shows live examples in every state, day and night side by side, at desktop and 375 px. It also shows the props, a do and a don't, keyboard and screen-reader behaviour, and the code to copy.

The site is a static build from the product's own components, deployed as its own Worker, like `design.lymi.app`. It is not a separate component library.

## 7. Inventory

**Primitives.** Built on Base UI, with Holler owning every style and shadcn's API shape so the parts feel familiar.

- `Button` and `IconButton`
- `Input`, `Textarea` and `Field` (label, hint, error)
- `Checkbox`, `Switch`, `RadioGroup` and `RadioCard`
- `Select` and `Combobox` (the people picker with chips)
- `DatePicker` and `TimePicker`
- `Dialog` (which becomes a sheet on a phone), `Popover`, `DropdownMenu` and `Tooltip`
- `Toast`, `Tabs` and `Segmented`
- `Separator`, `Kbd`, `Skeleton`, `Progress` and `Avatar`

**Product components.**

- `Plate`, `PlateRow` and `PlateStrip`
- `PageHeader` and `StatRow`
- `Chip`, `StatusChip` and `ModeGlyph`
- `HollerRow`, `PersonRow` and `Table` (compact)
- `Notice`, `EmptyState` and `ErrorState`
- `CopyField`
- `QuestionCard` and `OptionList`, the editor's building blocks

**Results.** These are built from the `summarize` output in `packages/core`.

- `ChoiceBars` for single and multiple choice, with who picked what on named hollers
- `ScaleDistribution` with its average
- `TextAnswers`
- `Completion` (answered, waiting, away)
- `PulseTrend` for a repeating pulse over time
- The gated state for an anonymous Holler under five responses

**Slack.** These are rendered previews generated from the same Block Kit builders the app sends, with the JSON and a Block Kit Builder link beside each.

- The invite, in four shapes: one tap, modal, web link and chase
- The three reminder tones, the thank-you and the closed reply
- The channel announcement with its live count, and the sender notices
- The answer modal
- App Home, in two versions: for a sender and for a recipient
- The `/holler` modal

## 8. States every interactive component has

Default, hover, focus-visible, active, disabled, pending, error, plus empty and loading where it holds content. Each state appears in day and night, with reduced motion, and with logical directions so a right-to-left layout needs no rework.

## 9. Checks

The existing checks stay:

- Token drift against DESIGN.md
- No raw colours or physical directions
- WCAG contrast for every text pair, in both themes
- axe on every page the browser tests visit

These checks are added:

- **Coverage.** Every export in `components/ui` and `components` has a page and at least one example on the design site, or the build fails.
- **Visual regression.** Playwright screenshots every example in day and night at two widths, and a change needs an approved new baseline.
- **Accessibility per example.** axe runs on every example, not only on journeys.
- **Slack.** Every message builder has a snapshot test and stays within Slack's limits: 50 blocks in a message, 100 in a modal, `text` always set.

## 10. Recommended references during the build

These are files in the `impeccable` skill: `typeset.md` for the scale review, `colorize.md` for the canvas question, `layout.md` for spacing and density, `animate.md` for motion tokens, and `harden.md` for states. The `dataviz` skill covers the results charts.

## 11. Open

- The design site's address. This brief assumes `design.holler.team`, which comes with buying the domain.
- Whether the design site is public. This brief assumes it is, since the repo already is.
