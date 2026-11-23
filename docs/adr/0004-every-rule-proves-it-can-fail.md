---
status: proposed
date: 2026-11-23
---

# Every rule proves it can fail

A rule that a check enforces is one file in `guards/`. The file names the mistake the rule stops and the edit that brings that mistake back. CI makes the edit in a scratch copy of the repository and fails when the check still passes.

## Context

`AGENTS.md` kept the rules as a table. Three things went wrong with it.

The table was one place that every change edited. On 23 November, 8 of the 11 open pull requests changed `AGENTS.md`, and each merge made the others conflict.

Nothing showed that a check still worked. A lint rule that matches a name stops matching when the name changes, and a test keeps passing when the code it watched moves elsewhere. The table still listed both.

The table recorded the check but not the mistake, so nobody could tell whether a rule was worth keeping.

## Considered options

- **One file per rule, with a proof that runs in CI:** accepted. Two branches that add rules change two files. A check that stops working fails CI.
- **Keep the table and review it by hand:** rejected. It depends on someone remembering to.
- **Mutation testing over the whole codebase (Stryker):** rejected. It takes hours over services that each start a local D1, and it reports lines, not rules. A guard says which mistake matters.

## Consequences

- `pnpm check` fails when the code a guard breaks has moved, so whoever changes protected code updates its proof in the same pull request.
- `pnpm check` fails when a lint rule or a `scripts/check-*.mjs` has no guard.
- CI spends four short jobs proving guards on every pull request. Production deploys wait for them.
- A check must fail for the stated reason: its output has to contain the guard's `fails` text.
- Rules are no longer read in one table. `pnpm guards` prints them by layer.
- A pull request open before this change has rows for a table that is gone. Each row becomes a guard file when the branch takes `main`.
