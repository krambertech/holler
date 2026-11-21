---
status: accepted
date: 2026-11-21
---

# Source files carry no comments

TypeScript and JavaScript files in Holler carry no comments. A reason goes in a name, a type, a test or a check. A decision or an outside constraint goes in an ADR or in the doc that owns the code, and that doc names the code it covers. Tool directives stay: `oxlint-disable-next-line` with its reason after `--`, `@ts-expect-error`, `/// <reference>`, `/** @type {…} */` and the `check-styling: allow` marker.

## Context

Holler started with 2,133 comment lines in 214 files. Many restate the next line, some name code that has since changed, and the useful ones record a Slack, D1 or Workers constraint that a reader of `docs/slack.md` or `docs/data-model.md` never sees. A comment goes stale silently, because nothing checks it against the code, and an agent reads it as true. A doc gets read and reviewed as a doc.

Lymi made the same call. Of the first 206 comments it deleted, 153 were decisions that belonged in a doc and 42 restated the code.

## Considered options

- **Ban new comments and work the old ones down:** accepted. The rule is cheap to follow, and the baseline lets each later pull request clear one directory without letting new comments in.
- **Keep "comment only what the code cannot say":** rejected. Every comment passes that test in its author's eyes, so it bans nothing.
- **Delete every comment now:** rejected. Each decision record needs a home in a doc, and that sorting does not fit one reviewable pull request.

## Consequences

- The Oxlint rule `holler/no-comments` shows the error in the editor and in `pnpm check`. It reads `scripts/comment-baseline.json`, which records how many comment lines each older file may keep. A new file may keep none, and a count may only fall.
- `pnpm check:comments` fails when a file holds more than its baseline, and also when the baseline allows more than a file holds. After deleting comments, `pnpm check:comments --update` lowers the baseline; it never raises it.
- The [delete-comment skill](../../.agents/skills/delete-comment/SKILL.md) works through the baseline one directory at a time. It sorts each comment into tautology, stale, excuse or decision record, files an issue for each excuse, and moves each decision record into a doc or ADR.
- JSDoc on an exported function counts as a comment. Its content moves to the doc that owns the module, or into the name and the types.
- CSS, HTML, Astro and shell files are not measured yet.
