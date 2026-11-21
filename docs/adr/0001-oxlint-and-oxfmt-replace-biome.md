---
status: accepted
date: 2026-11-21
---

# Oxlint and oxfmt replace Biome

Oxlint lints the repository and oxfmt formats it, in place of Biome. `pnpm check` runs `oxfmt --check .` and `oxlint .`, and `pnpm fix` writes both. `.oxlintrc.json` and `.oxfmtrc.json` hold the configuration. Holler's own rules live in `oxlint-plugin-holler`, one JavaScript file and one test per rule.

## Context

Biome's plugins are GritQL patterns over its own syntax tree, which keeps comments as trivia no pattern can reach. So the comment ban in [ADR 0002](0002-source-files-carry-no-comments.md) could not be a lint rule. The two Grit plugins, `no-sql-lower` and `no-multi-row-insert`, were tested by writing a probe file into `apps/web/src/server` and running Biome on it.

Oxlint's JS plugins take ESLint's rule API, including `sourceCode.getAllComments()`, and run beside Oxlint's native Rust rules. Lymi made the same switch on the same day, in its ADR 0040, and Holler copies Lymi's shape where it works.

## Considered options

- **Oxlint and oxfmt:** accepted. One plugin API covers every custom rule, comments included, and each rule test runs the real linter on a fixture in a temporary folder.
- **Keep Biome and add ESLint for the comment rule:** rejected. Two linters, two configs and two editor extensions, kept for one rule.
- **Keep Biome and check comments with a script only:** rejected. The editor would never show the error, and every later rule that reads comments would need a script too.

## Consequences

- Speed is not the reason. Holler is small: `biome check .` took about 0.4 seconds and `oxlint .` takes about 0.6, most of it starting the JS plugin.
- The switch reformatted six files once. Biome's import order already matched oxfmt's groups. JSON keeps no trailing commas.
- Every `biome-ignore` became an `oxlint-disable-next-line` with its reason after `--`. Biome's ignore covered a whole statement, but Oxlint's covers one line, and a hook's dependency finding sits on its dependency array, so a suppression that spans a hook uses `oxlint-disable` and `oxlint-enable` around it.
- `pnpm check` fails on a suppression that suppresses nothing (`--report-unused-disable-directives-severity error`). Nine Biome ignores had no Oxlint finding to cover and were deleted.
- Oxlint's correctness rules find more than Biome's recommended set did. Rules Lymi turned off for the same findings are off here too: React Compiler checks such as `react/refs`, and `jsx-a11y/prefer-tag-over-role`, `no-autofocus` and `control-has-associated-label`, which fight Base UI's role-based parts. The remaining new findings carry a suppression that says "Biome let this pass". Two of them are real gaps to fix: `aria-invalid` on the follow-up picker's button, and the touch combobox and select triggers that lack `aria-controls`.
- Biome's CSS lint rules have no Oxlint equivalent, so CSS is formatted but not linted. `pnpm check:styling` still checks colours and directions there.
- Oxlint's JS plugins are alpha and oxfmt is beta, so an upgrade can change a diagnostic or a format. The versions are pinned exactly, and an upgrade is its own pull request.
- Editors need the Oxc extension in place of Biome's.
