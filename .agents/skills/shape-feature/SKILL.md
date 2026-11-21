---
name: shape-feature
description: Shape an undecided Holler feature into a buildable slice before any code. Use when the outcome, behavior or scope of a feature still needs decisions; skip decided work, bug fixes and reviews.
---

# Shape a feature

Turn a rough idea into decisions another agent can build from, without implementing anything. [`PRODUCT.md`](../../../PRODUCT.md) says who Holler is for, [`CONTEXT.md`](../../../CONTEXT.md) owns the words, [`DECISIONS.md`](../../../DECISIONS.md) holds what is settled, and [`docs/slack.md`](../../../docs/slack.md) is the design of every Slack surface.

## 1. Ground it

- Read the owning docs and the current code, and search open and closed issues, before asking anything the repository already answers.
- Restate the outcome for the sender or recipient, and the observable result that would prove it.
- Sort what you know into facts, assumptions and open decisions.

## 2. Decide, one question at a time

Hold the open decisions as a private tree. Ask the one most likely to change or remove the work, then recompute after each answer. Each question fits one screen and most answers are one character:

```
**<the question, one line>**

a) <option>
b) <option>
c) <option>

Lean: b, <the reason in one clause>

4 settled, 3 open
```

- Give two to four concrete options when the decision has them, and always a lean.
- Look up facts yourself. Ask only for judgment: product behavior, copy tone, scope, price.
- Settle a reversible choice the user delegated with the smallest default, and say so. Return irreversible or risky ones to the user.

Done when the outcome, the boundaries, the smallest vertical slice and its acceptance evidence are clear, or one named decision blocks them. Stop there; a template is not a reason to keep asking.

## 3. Route it

- **One focused pull request:** a ready issue, via [`create-issues`](../create-issues/SKILL.md) when the user wants it tracked.
- **Several independently verifiable slices:** a parent issue with sub-issues, via `create-issues`.
- **A settled brand or product decision that outlives the feature:** a line in `DECISIONS.md`.

Return the decisions, assumptions, remaining questions, the recommended artifact and the next action, drafted in chat. Write to GitHub or the repository only when asked.
