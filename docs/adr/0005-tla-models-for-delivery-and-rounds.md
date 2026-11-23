---
status: proposed
date: 2026-11-23
---

# TLA+ models check delivery and rounds

Two small TLA+ models in `formal/` describe what sending, reminding, answering, closing and repeating do to D1, the queue and Slack, one statement or call at a time. CI checks every order of those steps within stated bounds, and fails when the code a model describes changes before someone confirms the model.

## Context

The worst bugs in #10, #22 and #32 were orders of events: a queue refusing halfway through a pass, a message delivered twice, a stop landing between a read and a write. Every one passed its tests, because a test runs the order its author thought of. Reviewers found them by hand.

Holler has no transaction across D1, Cloudflare Queues and Slack, so the order of steps is the design. The services are TypeScript, and no verifier runs on it.

## Considered options

- **TLA+ with TLC:** accepted. It explores every interleaving, the default tool for this question, and gives the shortest path to a broken promise. One pinned jar and Java, which ubuntu runners have.
- **Deterministic simulation of the real services (a scheduler over local D1, the queue and FakeSlack):** deferred. It would run the real code, but each step costs milliseconds, so it samples orders where the models cover all of them. The models say which orders are worth a service test.
- **Property tests with generated schedules:** rejected for this question, for the same reason. `delivery.test.ts` keeps the orders that happened.
- **Alloy, P or Spin:** rejected. Nothing here needs more than TLC, and TLA+ has the most people and agents who can read it.

## Consequences

- A model proves the model. `covers.json` holds a hash of each function a model describes, and `pnpm check` fails when one changes until `pnpm check:models --confirm`. Nothing but a careful reader makes that confirmation true.
- Whoever changes a covered function reads a second language. The spec says each step in the code's words, and the [`verify-delivery-model`](../../.agents/skills/verify-delivery-model/SKILL.md) skill says what to do.
- Each past bug is a run with one protection taken out, so a model that stops catching it fails CI.
- What the code gets wrong today is a recorded finding in [`formal/counterexamples.md`](../../formal/counterexamples.md). A fix makes the check ask for the record to change, so the list cannot go stale.
- `pnpm check:models` needs Java, so it runs in CI and by hand. `pnpm verify` runs only the hash check.
