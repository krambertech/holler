# A recipient answers on the web form

A Holler Slack cannot show, such as one with a follow-up only after some answers, is answered at `/respond/<id>`. The person has no account: the signed link from their DM says who they are. Answers go through `recordResponse`, like every other door.

## Reach

`POST /api/dev/web-survey` makes a live survey with every question type, sent to the lead and Marta, and returns the lead's link. In real use the link is the **Answer** button in the invite DM.

## Drive

[`respond.mjs`](respond.mjs) as `lead`: open the link, press **Send answers** with nothing answered, then answer every question, checking the follow-up shows after Tallinn and Other and not after Lisbon, and send.

## End state

The page says **Your answers are in**, with a **See my answers** link to `/answers/<id>`. `/api/dev/state` counts the survey answered by one and drops `U0LEAD` from `waiting`, and its results hold the Other write-in and the follow-up note.

## Gotchas

- The survey is made without a send, so it never uses up Free's monthly limit and has no DM in the FakeSlack record. `services/respond.test.ts` proves the DM's thank-you after a real send.
- The person picker searches the directory as you type; wait for the option before choosing it.
