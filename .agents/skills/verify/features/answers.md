# Your answers

A person's own list of every Holler sent to them and what they answered, anonymous ones included, and one Holler's answers on its own page.

## Reach

The **Your answers** link in the header, then `/answers` and `/answers/<holler id>`.

## Drive

[`answers.mjs`](answers.mjs) as `lead`, which seeds the workspace, then signs in as `sender` (Tom), who was sent the lead's hollers: check the three groups, check the waiting row's **Answer in Slack** opens Slack, open a named answer and an anonymous one.

## End state

**Waiting on you**, **Answered** and **Closed before you answered** each list Tom's seeded hollers. *Offsite: which dates work?* shows each question with Tom's picks. *Team health check* shows Tom's anonymous answers under "Only you can see which answers are yours."

## Gotchas

- Signing in as `sender` with `reset=1` wipes the lead's hollers, and they seed only when the lead signs in. The recipe starts as `lead` for that reason and switches without a reset.
- At 375 px the **Answer in Slack** button wraps under the title; match it by role and name, not position.
