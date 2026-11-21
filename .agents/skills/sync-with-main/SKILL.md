---
name: sync-with-main
description: Rebase the current branch onto `origin/main` and resolve routine conflicts so a stale or conflicted pull request can move again. Use when GitHub says the branch has conflicts or is behind, or when asked to sync, update or rebase a branch.
---

# Sync with main

[`docs/git-workflow.md`](../../../docs/git-workflow.md) is the rule: rebase, never merge `main` into a branch. This skill is the careful execution and the conflicts that have a known answer.

## 1. Record a recovery point

```bash
git branch --show-current
git rev-parse HEAD
git status --short
git log --oneline origin/main..HEAD
```

Write down the branch and HEAD. The working tree must be clean: commit the intended work first. Worktrees share one stash stack, so a commit is the safe place to park work.

## 2. Rebase

```bash
git fetch origin
git rebase origin/main
```

During a rebase, `--ours` is `main` and `--theirs` is the branch commit being replayed.

## 3. Resolve the generated files

These are never hand-merged. Take `main`'s side, then regenerate from the rebased source.

- **`pnpm-lock.yaml`.** Resolve `package.json` conflicts first, then `git checkout --ours pnpm-lock.yaml && pnpm install && git add pnpm-lock.yaml`.
- **`apps/web/src/client/routeTree.gen.ts`.** `git checkout --ours` it, then `pnpm --filter @holler/web build` rewrites it.
- **A migration on both sides.** Per [`docs/work-areas.md`](../../../docs/work-areas.md): delete the branch's migration SQL, its snapshot and its journal entry, take `main`'s `_journal.json` and `scripts/migration-manifest.json`, then `pnpm db:generate` and `node scripts/check-migrations.mjs --write`. Applied migrations never change, so `main`'s always wins.

## 4. Resolve code conflicts, or stop

A conflict in hand-written code means two changes touched the same lines. Resolve it only when you can state which intent each side had and why the result keeps both. Otherwise `git rebase --abort`, which returns to the recorded HEAD, and hand back the conflicting paths with both intentions summarized.

## 5. Prove and push

```bash
git rebase --continue
pnpm verify
git diff origin/main --stat
git push --force-with-lease
gh pr view --json mergeable,mergeStateStatus
```

Done when `pnpm verify` passes, the diff against `origin/main` holds only the branch's intended change, and GitHub reports `MERGEABLE`. A lease failure means someone pushed after your fetch: stop and inspect, never escalate to a plain force-push.
