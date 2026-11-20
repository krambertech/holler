# Product

## Register

product

## Users

Holler is for the person on a team who has to ask everyone something and then get every answer back. Leads come first: an engineering, product or operations lead at a company of 10 to 300 people who runs a weekly pulse, asks which offsite dates work, or chases the team for a form. People and ops teams come second: they send to the whole company, and Holler must let them without being designed around them.

The sender works in Slack all day and opens the web app for two minutes at a time: to write a Holler, to see who still has not answered, and to read the results. The people answering never open the web app if they can avoid it. They answer in Slack, in one tap where the question allows it, and they never need an account.

The job to be done is "ask my team, stop chasing them, read the answers." Writing a Holler takes about two minutes. Chasing is Holler's job, not the sender's.

## Product Purpose

Holler sends a question to people in Slack, reminds the ones who have not answered, and shows the results. It has three modes: a pulse (one or two quick questions, often on a schedule), a survey (several questions), and a form chase (a link to someone else's form, and Holler tracks who says they submitted it).

It exists because the tools on either side each fail in one way. Form builders collect answers well but leave the chasing to the sender. Slack poll apps live in channels, where people answer in public or not at all. Holler asks each person directly, keeps asking politely until they answer or the Holler closes, and treats anonymity as a real promise.

Holler started as Tally, an internal tool at Buffer. Holler is the public product: any Slack workspace can install it. A workspace sends a few hollers a month for free and pays for more.

Success looks like this: a lead sends a pulse every week without thinking about it, most people answer within a day without a manual nudge, and the lead reads the results in Holler, in Slack, through the API, or through an assistant over MCP.

## Brand Personality

Plain, warm, brief. Holler talks like a helpful colleague in Slack. The name is the only playful word; everything else says what happens. "7 of 12 answered", not "7 hollered back". "Holler" is a noun and never a verb in the interface.

The emotional goal is relief for the sender and no guilt for the person answering. Reminders are polite and spaced out, never nagging, and an answer is always one tap away.

## Anti-references

- A generic SaaS dashboard: left rail, filter side panel, people table, KPI tiles. Holler is a small tool and looks like one.
- Survey-builder chrome (SurveyMonkey, Typeform's editor): drag handles everywhere, logic trees, themes.
- The theme spread over the interface. The first design round put speech-bubble corners, hills, a loudspeaker and a dark radio screen into the UI, and all four looked cartoonish. The theme lives in the logo only.
- Tally's newsroom red. That identity stays with Tally.
- Bot-voice copy: exclamation marks, emoji, "Oops!", "Radio silence".

## Design Principles

1. **Two minutes, tops.** Every sender task, from a new Holler to reading results, fits in a two-minute visit. If a screen needs a tour, it is wrong.
2. **Slack is the main stage.** The person answering stays in Slack. The web app is for the sender, and anything a sender does often should also work from Slack.
3. **Chasing is Holler's job.** The interface always shows who is still to answer and when Holler reminds them next, so the sender never has to chase by hand.
4. **Anonymous means anonymous.** An anonymous Holler stores no link from a response to a person, rounds the response time, and hides results until enough people answered that no one can be picked out. The interface says what the sender can and cannot see.
5. **One surface, many doors.** The web app, the Slack app, the API and the MCP server follow the same rules through the same services. Nothing one door can do bypasses a rule another door keeps.

## Accessibility & Inclusion

WCAG 2.2 AA, checked in CI with axe in the Playwright tests. Text meets 4.5:1 and large text 3:1, in both the day and night palettes. Every status has a word beside its colour (Live, Answered, Waiting, Away, Closed), so colour is never the only signal. Everything works from the keyboard with a visible focus ring. Motion follows `prefers-reduced-motion`. Slack messages put the question text first and keep emoji out, so screen readers in Slack read the question rather than decoration.
