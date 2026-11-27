# Holler

Holler asks a team something in Slack, reminds the people who have not answered, and shows the results. This file is the authority on the domain words. Use these names in code, the API, the interface and docs, and avoid the words listed after each one.

## Language

### The product

**Holler**: One ask sent to a set of people: its questions, its recipients, its schedule and its results. Capital H for the product and in Slack, lowercase in the wordmark and in "your hollers". A noun only: "send a Holler", never "holler at your team". In code it is `holler`, plural `hollers`. _Avoid_: Survey (for the thing), poll, form, tally, campaign, request

**Mode**: What kind of Holler it is, chosen first because it shapes everything after. Three modes. _Avoid_: Type, kind, template

- **Pulse**: One or two quick questions, answered in Slack in one tap or a small modal, often sent on a schedule. `pulse` in code.
- **Survey**: Several questions, answered in a Slack modal when they fit and on the web when they do not. `survey` in code.
- **Chase**: A link to a form that lives somewhere else. It has no questions; the recipient marks it done with **I submitted it**, and Holler chases everyone else until it closes. `chase` in code too. _Avoid_: Form chase (the earlier name), form, external survey, link

**Question**: One thing a Holler asks. A chase has none. Every question has a **type** (`single`, `multi`, `text`, `number`, `person`) and a **style** (`plain`, `scale`, `binary`) that says how a single-choice question looks. A question can carry a **description** (one line of help under it). _Avoid_: Field, item, prompt (for the whole question; `prompt` is the question's text), hint, caption

**Option**: One choice in a single- or multiple-choice question. _Avoid_: Answer (for the choice), choice (in code)

**Question template**: A preset that fills in a question's type, style and options: Single choice, Multiple choice, Free text, Rating 1–5, Agreement scale, Frequency scale, Yes or no. A template is how a question is made; once made it is an ordinary question. _Avoid_: Question type (in copy)

**Other**: An option a plain choice question can add that lets someone write their own answer. `allowOther` on the question; one option row with `is_other`. _Avoid_: Custom answer, write-in (in copy)

**Pick limit**: The most options (multiple choice) or people (person) someone may pick: "Pick up to 3". `maxChoices` in code. _Avoid_: Max selections

**Follow-up note**: An optional text box after a choice question, such as "Anything to add?". It shows after any answer, or only after chosen answers, which needs the web form. _Avoid_: Comment, reason field

**Template**: A ready Holler to start from, such as Weekly pulse, Retro or eNPS. Picking one opens the editor filled in; from then on it is an ordinary draft. In copy "template" means only this, never a question template. _Avoid_: Starter, preset, example

**Answered in**: Where people answer a Holler: right in the DM (a pulse of one single-choice or free-text question), in a Slack form (a modal), or on a web page. The editor says which before it is sent. `answerSurface` in code. _Avoid_: Channel, delivery method

### People

**Workspace**: One Slack workspace that installed Holler. Everything belongs to a workspace: members, hollers, the plan and the bill. In code it is `workspace`, keyed by Slack's team id. _Avoid_: Team, org, organization, tenant, account

**Member**: A person in a workspace who has signed in to Holler with Slack. Members send hollers and read results. A member is an **owner** (installed Holler or was made one, manages billing) or a **sender** (everyone else). _Avoid_: User (in copy), admin, seat

**Recipient**: A person a Holler is sent to. A recipient needs no account: they are a Slack user in the workspace, and they answer in Slack or on a web page Slack links them to. _Avoid_: Respondent (before they answer), participant, target, audience member

**Audience**: Everyone a Holler is sent to, as the sender chose them: people, Slack user groups and channels' members, or the whole workspace. The audience is resolved to recipients when the Holler is sent. _Avoid_: Targeting, distribution list

**Viewer**: A person in the workspace a Holler's creator shared its results with, by Slack user. Someone who has never signed in can be one, and sees the results once they sign in to Holler. _Avoid_: Collaborator, guest

### Lifecycle

**Draft**: A Holler that is not sent and has no send time. Saved as the sender types. _Avoid_: Unsaved, pending

**Scheduled**: A Holler with a send time in the future. It sends itself. _Avoid_: Queued, planned

**Live**: A Holler that is sent and still taking answers. The interface groups hollers as Live, Scheduled and Closed. _Avoid_: Open, active, running, in progress

**Closed**: A Holler that takes no more answers, because its close time passed or its creator closed it. _Avoid_: Done, finished, ended, archived

**Close time**: When a Holler closes by itself. "Closes Friday at 18:00". _Avoid_: Deadline, due date, expiry

**Repeating pulse**: A pulse that goes out again every week or every fortnight, on the day and time of its first round. Each time it goes out is a **round**, its own Holler with its own results. _Avoid_: Recurring survey, series (in copy), schedule (for the rule)

**Send in their time zone**: A scheduled Holler that reaches each recipient at the same local time, so Monday 09:00 is Monday 09:00 for everyone. _Avoid_: Localized send

### Answering

**Response**: One recipient's set of answers to one Holler, or their **I submitted it** in a chase. A recipient has at most one. _Avoid_: Submission (in copy), reply, entry, result

**Answer**: What a response holds for one question: chosen options or text. _Avoid_: Value, input

**Answered**: A recipient who has a response. The counterpart is **waiting**. "7 of 12 answered", "Waiting on 5 people". _Avoid_: Responded, completed, done, hollered back

**Reminder**: A Slack message Holler sends a recipient who is still waiting. Reminders follow a fixed rhythm: a gentle one, a nudge, and a last one before the close time. A sender can also **send a reminder** to everyone waiting right now. _Avoid_: Nudge (as the noun in copy), ping, chase (for one message), follow-up, holler again

**Snooze**: A recipient's "Remind me later" on a reminder, which moves only their next reminder. _Avoid_: Mute, dismiss

**Anonymous**: A Holler whose sender sees how many answered, never who said what. Holler still knows who answered, so it can stop reminding them, and keeps a private link from each response to its person so they can read their own answers; nobody else ever sees that link (ADR 0003). Results open only once at least five people answered. _Avoid_: Private (which is about who can see results), confidential

**Results**: What a Holler's responses add up to: counts per option, averages for scales, and the text answers. _Avoid_: Report (for the in-app view), analytics, stats, insights

**Report**: A read-only page of a Holler's results, opened with an unguessable link, so it can be shared with people who are not members. It names no one, even on a named Holler. _Avoid_: Public link, share page

**Your answers**: A person's own page in the web app listing every Holler sent to them, where it stands (waiting on you, answered, closed before you answered), and what they answered. _Avoid_: My responses, history, inbox

**Export**: A file of a Holler's results or responses: CSV for spreadsheets, Markdown for docs. _Avoid_: Download (as the noun), dump

### Access and money

**Visibility**: Who in the workspace can see a Holler's results. **Just me** (and viewers) or **Everyone in the workspace**. _Avoid_: Privacy, sharing level, public

**Plan**: What a workspace pays for. **Free** sends a few hollers each month; **Team** has no monthly limit. `free` and `team` in code. _Avoid_: Tier, subscription (in copy), package, license

**Monthly limit**: How many hollers a workspace on Free may send in a calendar month. Counted when a Holler is sent, not when it is drafted, so drafts are always free. _Avoid_: Quota, credits, allowance

**API key**: A secret a member makes in Settings to call the API from scripts. It acts as that member. _Avoid_: Token (in copy), secret key, PAT

**Connected app**: An MCP client, such as Claude or ChatGPT, that a member allowed to act for them through OAuth. _Avoid_: Integration (for this one), plugin, bot

**Activity**: The list of what was done in a workspace and by whom: the web app, Slack, an API key or a connected app. Every write lands there, and owners read it at the end of Settings. _Avoid_: Audit log (in copy), history, events
