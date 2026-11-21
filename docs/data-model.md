# Data model

The schema is in `packages/core/src/schema`. This page explains the shape and the rules the schema cannot say by itself. Every top-level product table carries `workspace_id`. The tables that hang off a Holler (`questions`, `options`, `recipients`, `viewers`, `responses`, `answers` and `answer_notes`) do not: they are scoped through `holler_id`, so a service reaches them only after it has loaded the Holler filtered by the context's workspace.

```mermaid
erDiagram
  workspaces ||--o| slack_installations : "has a bot"
  workspaces ||--o{ members : "has"
  workspaces ||--o{ slack_people : "caches"
  workspaces ||--o{ slack_groups : "caches"
  workspaces ||--o{ hollers : "owns"
  workspaces ||--o{ activity : "records"
  user ||--o{ members : "is"
  members ||--o{ hollers : "creates"
  hollers ||--o{ questions : "asks"
  questions ||--o{ options : "offers"
  hollers ||--o{ recipients : "is sent to"
  hollers ||--o{ responses : "collects"
  hollers ||--o{ viewers : "is shared with"
  responses ||--o{ answers : "holds"
  responses ||--o{ answer_notes : "adds"
  answer_notes }o--|| questions : "goes with"
  answers }o--|| questions : "answers"
  answers }o--o| options : "picks"
```

## Tables

| Table                                                     | One row is                                  | Notes                                                                       |
| --------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------- |
| `workspaces`                                              | A Slack workspace that installed Holler     | Keyed by `slack_team_id`. Holds the plan; only the Polar webhook changes it |
| `slack_installations`                                     | The workspace's bot                         | The token is AES-GCM ciphertext. A reinstall replaces the row               |
| `members`                                                 | A person signed in to Holler in a workspace | Links a Better Auth `user` to a Slack user id. `owner` or `sender`          |
| `slack_people`, `slack_groups`                            | Holler's copy of the Slack directory        | For the picker and names. `search_name` is folded in JavaScript             |
| `directory_syncs`                                         | Where each workspace's directory sync stands | Slack's cursor between steps, so a big workspace syncs over several cron runs |
| `hollers`                                                 | One Holler, from draft to closed            | A draft is a Holler with status `draft`                                     |
| `questions`, `options`                                    | What a Holler asks                          | Synced by id while a draft or scheduled; frozen once sent. One option row per question may be Other (`is_other`), always last |
| `recipients`                                              | One person a Holler went to                 | The completion ledger: invited, answered, reminders, the DM to update       |
| `responses`, `answers`                                    | One person's answers                        | No person on an anonymous Holler                                            |
| `answer_notes`                                            | A follow-up note or an Other write-in       | Beside a choice answer, at most one of each kind per question per response  |
| `viewers`                                                 | A member a Holler's results are shared with |                                                                             |
| `activity`                                                | One write                                   | The only writer is `services/audit.ts`. `action` is one of `activityActions` in `packages/core/src/activity.ts`, and Settings has a sentence for each |
| `slack_deliveries`                                        | A Slack event or view already handled       | Drops Slack's retries                                                       |
| `user`, `session`, `account`, `apikey`, `jwks`, `oauth_*` | Better Auth                                 | Generated: `pnpm --filter @holler/web auth:schema`. Never edit by hand      |

## Lifecycle

```mermaid
stateDiagram-v2
  [*] --> draft: createDraft
  draft --> scheduled: send with a send time
  scheduled --> draft: unschedule
  draft --> live: send now
  scheduled --> live: cron sends it
  live --> closed: close time passes, or the creator closes it
  closed --> [*]
```

Sending is the moment a Holler counts against the monthly limit (`hollers.sent_at`), resolves its audience into `recipients`, and freezes its questions.

## Rules

**Anonymity.** For an anonymous Holler, `responses.slack_user_id` is null and `responses.submitted_at` and `recipients.answered_at` are rounded down to the hour. `recipients.answered_at` is how Holler knows who answered without knowing what they said. Results open only at five responses (`anonymousThreshold` in `packages/core/src/results.ts`), and the same gate applies to the web app, the API, MCP, exports and Slack.

**One response per person.** The answer path claims `recipients.answered_at` with a guarded update before it writes the response, so two submits at once produce one response. On a named Holler the partial unique index `responses_one_per_person` backs it up.

**An option answers only its own question.** `answers (question_id, option_id)` is a foreign key to `options (question_id, id)`, and a check makes each answer either an option or text, never both.

**What `answers.text` holds.** A free-text answer's words; a number answer's whole number as its decimal string, such as `"12"` or `"-3"`; a person answer's Slack user id, one `answers` row for each person picked. `recordResponse` checks a number against the question's `number_min` and `number_max`, and a person against `slack_people` for the workspace, before it writes.

**Other and follow-up notes.** A plain choice question with `allowOther` has exactly one option row with `is_other` true, labelled Other and placed after every option the sender wrote. The editor never sends it as an option: `syncQuestions` keeps its id across autosaves and deletes it when Other is turned off. What someone writes beside Other, and the follow-up note after a choice question, are `answer_notes` rows (`kind` is `other` or `note`), because an `answers` row holds an option or text, never both. A follow-up's `follow_up_when` lists option positions, with Other at the last position; null shows it after any answer.

**Activity.** `services/audit.ts` takes an `ActivityAction`, so a new action does not typecheck until it is added to `activityActions`, and the client's `Record<ActivityAction, …>` of sentences in `components/settings/activity-row.tsx` does not typecheck until it says it in words. `listActivity` in `services/activity.ts` is for owners only and pages 50 rows at a time by `(at, id)`, so rows written in the same millisecond are neither skipped nor repeated. It passes on only a few known fields of `data` (`recipients` as `count`, `from`, `to`, `reason`, `name`, `role`), so a field such as a Polar subscription id never reaches the page.

**Mode.** The mode may change while a Holler is a draft or scheduled. A chase has no questions, so saving a draft as a chase deletes its questions.

**Case folding.** SQLite's `lower()` folds ASCII only, so Дієслова and дієслова would differ. Text that is searched is stored folded with `toLocaleLowerCase()` in a `search_*` column. Oxlint (`holler/no-sql-lower`) refuses `lower(` in server SQL.

**D1 binds at most 100 values in one statement.** Insert rows one per statement inside a batch, never a multi-row `values([...])` that can grow with input. `runBatch` in `apps/web/src/server/batch.ts` takes a list.

**Migrations.** Generate with `pnpm db:generate`, then record with `node scripts/check-migrations.mjs --write`. An applied migration never changes; `pnpm check:migrations` fails if one does.
