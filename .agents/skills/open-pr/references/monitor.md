# Supervise an open PR

Supervise the automated pipeline until the PR is review-ready. Waiting for a human merge is outside this workflow.

## Observe

- In the Claude desktop app, use the `ccd_pr` tools and let the app wake you on CI results. Elsewhere, `gh pr checks <number> --watch --required`. A pending check is not a pass.
- After each push, watch the new head commit's checks.
- When checks settle, read mergeability and any automated review comments, inline ones included.

## Respond

- When the branch caused a failure and the fix is mechanical and in scope: read the log, fix it, rerun the failing check locally and `pnpm verify`, push, and watch again.
- When `main` conflicts: rebase onto `origin/main` and push with `--force-with-lease`, per `docs/git-workflow.md`.
- Address factual, in-scope automated feedback and verify again. Summarize feedback that changes scope or needs a product decision for the user instead of settling it yourself.
- Stop as blocked when a fix needs a product decision or new permission, the failure is unrelated infrastructure, or the same fix has failed twice.
- Leave approving and merging to a person.

## Finish

Report **review-ready** only when required checks pass, the branch is mergeable, and no blocking automated feedback remains. Include the PR URL, head commit, checks, the verify evidence folder, and any non-blocking feedback. A push that changes the patch needs the verify run again.

Report **blocked** with the exact failing state and what is needed. If you cannot keep observing a pending check, say so rather than calling the PR ready.
