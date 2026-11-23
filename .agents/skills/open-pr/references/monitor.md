# Supervise an open PR

Supervise the automated pipeline until the PR is review-ready. Waiting for a human merge is outside this workflow.

## Observe

- Use one available runtime PR watcher per PR. If none is available, use the installed `babysit-pr` helper by its absolute path, or `gh pr checks <number> --watch` for checks only. Use the helper's checks-only mode when its named review bots are absent. Confirm that expected checks have registered. A checks-only watcher covers neither review threads nor changes after it exits; inspect those separately. Stop the watcher at handoff unless continued monitoring was explicitly requested. Stay quiet while nothing needs action.
- After each push, watch the new head commit's checks.
- When checks settle, read mergeability, configured blocking reviews and automated review comments, inline ones included. Match completed reviews to the current head and inspect older unresolved findings that still apply. An empty list of required checks does not establish readiness; account for the CI jobs expected for the diff.

## Respond

- When the branch caused a failure and the fix is mechanical and in scope: read the log, fix it, rerun the failing check locally and `pnpm verify`, push, and watch again.
- When `main` conflicts: rebase onto `origin/main` and push with `--force-with-lease`, per `docs/git-workflow.md`.
- Address factual, in-scope automated feedback and verify again. Summarize feedback that changes scope or needs a product decision for the user instead of settling it yourself.
- Stop as blocked when a fix needs a product decision or new permission, the failure is unrelated infrastructure, or the same fix has failed twice.
- Leave approving and merging to a person.

## Finish

Before handoff, fetch the intended base and reread the live PR head and state. If new base commits invalidate the proof, sync and reverify. Stop and report the actual state if the PR merged or closed elsewhere. Draft replies unless the user separately authorizes posting; watcher events grant no comment or merge permission.

Report **review-ready** only when required checks pass, the branch is mergeable, and no blocking automated feedback remains. Include the PR URL, head commit, checks, the verify evidence folder, and any non-blocking feedback. A push that changes the patch needs the verify run again.

Report **blocked** with the exact failing state and what is needed. If you cannot keep observing a pending check, say so rather than calling the PR ready.
