---
name: open-pr
description: Open or update a Holler pull request and supervise it until it is review-ready. Use when asked to open a PR, push a finished change for review, or get a PR's checks green.
---

# Open a pull request

Opening the pull request is the midpoint. The work is done when the PR is **review-ready**: only the intended diff, every required check green, the branch mergeable, no blocking automated feedback. Opening a PR never authorizes merging, deploying, or migrating production data.

## 1. Isolate the change

- `git fetch origin`, then read the branch, its upstream, the working tree, and the diff against `origin/main`.
- Keep unrelated work out. Include uncommitted changes that clearly belong to this PR; ask only when ownership is ambiguous.
- When the branch already has a PR, update it rather than opening a second.
- When `main` moved, rebase as [`docs/git-workflow.md`](../../../docs/git-workflow.md) says.

Done when the diff contains exactly the requested change and you can say what every hunk is for.

## 2. Prove it

- Read the whole diff against the request and [`AGENTS.md`](../../../AGENTS.md). Remove scope creep, debug output, and accidental generated changes.
- Run `pnpm verify`. Fix every failure.
- For a change a person sees, run `pnpm test:e2e`, and drive every feature the diff reaches with the [verify skill](../verify/SKILL.md) at 1280 px and 375 px, in day and night. A feature with no map entry gets one in this PR.
- For a rendered UI change, capture screenshots by [`references/screenshots.md`](references/screenshots.md).

Done when every check that applies has passed on the final diff, or you can name exactly which one could not run and why.

## 3. Open or update it

- Commit, push the branch, and title the PR `type(scope): imperative summary` per the git workflow.
- Write the body from [the template](../../../.github/pull_request_template.md): copy it to a temporary file, fill it, delete every guidance comment and every unused optional section. Verification lists only checks that ran, with the verify evidence folder.
- Read the PR back: base `main`, title, body, attached images, displayed diff.

## 4. Supervise it

Follow [`references/monitor.md`](references/monitor.md) right after opening or pushing. Finish in exactly one state: **review-ready**, with the PR URL, head commit and evidence; or **blocked**, with the failing check, conflict, feedback or permission needed. A pending check is neither.
