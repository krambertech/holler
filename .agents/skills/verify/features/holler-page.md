# The Holler page chases and closes

A live Holler's page shows who answered with the people still waiting first, says when Holler reminds them next, sends a reminder to everyone waiting with **Send reminder**, exports the results, and closes with **Close now** after asking once. `routes/_app/hollers.$id.tsx` and `components/results/` draw it; `hollerPeople` in `services/holler-people.ts` says who is waiting and when reminders are due; `remindWaiting` and `closeHoller` in `services/delivery.ts` do the work.

## Reach

Home, then the live **How was your week?** pulse.

## Drive

[`holler-page.mjs`](holler-page.mjs) as `lead`: open the pulse, press **Send reminder**, check the queue sent each waiting person a reminder, export the CSV, then **Close now** from the menu and confirm.

## End state

`/api/dev/state` → `slack.posted` has one reminder DM for each person who was waiting, the button is then disabled with the time the next reminder is possible, `GET /api/hollers/<id>/export?format=csv` has one row per answer, and the Holler is closed with a `holler.closed` Activity row from `web`. The page says Closed and has no Send reminder.

## Gotchas

- A reminder can go once every four hours, so a second run without `reset=1` finds the button disabled.
