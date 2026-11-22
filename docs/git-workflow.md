# Git workflow

`main` is Holler's readable release record: one pull request becomes one squash commit. Work on short-lived branches, rebase them while the pull request is open, and merge them through GitHub after CI passes.

## Start and sync a branch

Use the `kateryna/` prefix and a short kebab-case description:

```bash
git fetch origin
git switch -c kateryna/slack-one-tap-pulse origin/main
```

Bring an open branch up to date by rebasing it onto the remote `main`:

```bash
git fetch origin
git rebase origin/main
git push --force-with-lease
```

Commit or stash local changes before rebasing. Use the explicit fetch-and-rebase sequence rather than merging `main` into the branch. `--force-with-lease` protects remote work that appeared after the last fetch.

## Name commits and pull requests

Use Conventional Commits for meaningful branch commits and every pull request title:

```text
type(scope): imperative summary
```

Allowed types are `feat`, `fix`, `docs`, `refactor`, `test`, `perf`, `build`, `ci`, `chore`, and `revert`. Use a concise lower-case scope such as `web`, `site`, `api`, `mcp`, `slack`, `auth`, `billing`, `core`, `design`, `docs`, `repo`, or `deps`.

Keep the complete title to 72 characters. Start the summary with a lower-case word, use the imperative mood, and omit the final period. Add `!` before the colon for a breaking change.

```text
feat(slack): add one-tap pulse answers
fix(slack): retry rate-limited reminders
docs(repo): explain local setup
feat(api)!: replace the holler response shape
```

Name the concrete change in literal language. Use the final diff and the original request to choose the title, then check it against the repository's format and recent merged examples. Prefer a specific verb and object over broad words such as "improve", "streamline" or "harden". State a number or performance gain only when measured evidence supports it. Revisit the title and body when scope changes.

Fixup commits are acceptable while a pull request is in progress because GitHub squashes the branch. The pull request title is the durable commit subject, so make it describe one logical change.

## Write the pull request description

Start from [the template](../.github/pull_request_template.md). Open with the problem or missing capability, then the resulting behavior. Keep the summary to one or two short paragraphs. Put checks actually run, observed results, skipped checks and the verify evidence folder in Verification. Attach screenshots through [the screenshot guide](../.agents/skills/open-pr/references/screenshots.md). Include implementation detail only when it explains a decision or material risk. Remove unused sections, file inventories and generated-by footers.

## Merge a pull request

Merge with **Squash and merge** after CI passes and review threads are resolved. Confirm that the generated commit title matches the pull request title. GitHub uses the pull request description as the commit body and deletes the branch after merging.

## What main refuses

Once installed, [`.github/rulesets/main.json`](../.github/rulesets/main.json) applies to everyone. A pull request must be squashed, up to date with `main`, have no open review threads, and pass two checks.

- `ready` needs every CI job except `deploy`, which runs after it. `pnpm check:workflows` fails if a new job is left out.
- `protect` runs `main`'s own copy of [`scripts/check-weakened.mjs`](../scripts/check-weakened.mjs), so a pull request cannot change the rule that judges it. It flags changes such as deleted guards or tests, disabled lint rules, new suppressions, and changed CI files. Name each flagged file under `## Weakened checks` in the description, with the reason.

Add a `Verified:` line naming what ran, or `none, because …`. Squash merging keeps it; `git log --grep "^Verified: none"` finds changes marked as unverified. The check warns for now; change `MODE` in `protect.yml` to `enforce` once it has run quietly for a while.
