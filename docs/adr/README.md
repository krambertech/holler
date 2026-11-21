# Architecture decision records

One file per decision that is hard to reverse, surprising without context, and the result of a real trade-off. Everything else lives in [stack.md](../stack.md), [data-model.md](../data-model.md), [slack.md](../slack.md) or [operations.md](../operations.md). Brand decisions live in [DECISIONS.md](../../DECISIONS.md). Vocabulary lives in [CONTEXT.md](../../CONTEXT.md).

An ADR is also where a decision goes when it leaves a source comment. Source files carry no comments ([ADR 0002](0002-source-files-carry-no-comments.md)), so a reason a reader needs lives here or in the doc that owns the code, and that doc names the code it covers.

## Writing an ADR

Use an ADR for one consequential decision that is accepted or ready for explicit approval. `proposed` means approval is pending; open product questions belong in [`shape-feature`](../../.agents/skills/shape-feature/SKILL.md) first.

- Title the ADR as the decision, not the topic.
- Include `status` and `date` in frontmatter; add `supersedes` only when one applies.
- State the decision in the opening paragraph. Keep `Context` to the facts and constraints that made a decision necessary.
- List only real alternatives under `Considered options`, with one short reason each was accepted, rejected or deferred.
- Record benefits, costs, constraints and required follow-ups under `Consequences`. Do not turn them into an implementation plan.
- Link research, issues and pull requests instead of copying them. Leave out chronology, tutorials and code walkthroughs.

Aim for 300 to 700 words. Go over only when cutting would hide a security, data, migration or operational consequence.

Name a new ADR with the next free number after rebasing on `main`. If two branches pick the same number, renumber the later one before merging. The folder listing is the index, and each ADR carries its own status, so keep no index here.
