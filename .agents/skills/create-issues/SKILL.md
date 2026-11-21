---
name: create-issues
description: Turn a settled Holler feature shape into GitHub issues an agent can build from cold. Use after shape-feature, when the user asks to create or track the work.
---

# Create issues

An issue is done when an agent with no access to this conversation can tell the outcome, the boundaries, the acceptance evidence and where to start.

## 1. Compile the shape

- Read the finished shape, the docs it rests on, the current code, and existing issues.
- Go back to [`shape-feature`](../shape-feature/SKILL.md) when an open product decision could change an outcome, a boundary or the evidence.
- Separate what is built from what remains. Merged work is context, not acceptance criteria.

## 2. Choose the tree

- One focused pull request: one issue.
- Several slices: a parent issue and one sub-issue per slice. Each slice is a tracer bullet: one narrow path through every layer it touches (core schema, service, route, Slack, screen), demonstrable alone and sized for one fresh session.
- Order slices with GitHub's blockers; group them with parentage.

When the issue count is not obvious from the shape, show the tree and get approval before the first write.

## 3. Write each body

Use these sections and drop only an empty one:

- **Outcome.** What the sender or recipient can do afterwards, in CONTEXT.md's words.
- **Scope.** The behavior delivered, with the settled interaction, permission and plan-limit rules.
- **Acceptance criteria.** Checkable postconditions, each one something a test or a verify recipe can observe.
- **Constraints.** Invariants, decisions and owning docs, linked rather than copied.
- **Out of scope.** The adjacent work this issue must not grow into.
- **Verification.** The service tests, Playwright journey and [verify](../verify/SKILL.md) features that prove it, including any new feature-map entry.

Leave code snippets, file lists and step-by-step plans out: they go stale before the issue starts.

## 4. Publish

- Search open and closed issues for duplicates first.
- Use existing labels only (`gh label list`). Ask before adding labels, milestones, assignees or edits to existing issues.
- Create blockers before their dependants: `gh issue create --parent <n>` for a sub-issue, `--blocked-by <n>` for an order.
- Read every created issue back and confirm title, body, parent and blockers.

Return the URLs and name the frontier issue: the one with no open blocker that can start now.
