# Closing a holler tells its creator in Slack

Closing a live Holler, by its creator or at its close time, edits every unanswered DM to say it closed, updates the channel announcement, and DMs the creator the final count. `closeHoller` and `queueCloseWork` in `services/delivery.ts` own it; the SLACK_SENDS consumer posts.

## Reach

No screen closes a Holler yet; the recipe calls `POST /api/hollers/<id>/close`, the route **Close now** will use. Home shows the result.

## Drive

[`slack-close.mjs`](slack-close.mjs) as `lead`: close the live **Offsite: which dates work?** survey, wait for the queue, then reload Home.

## End state

The Holler is closed with a `holler.closed` Activity row from `web`. `/api/dev/state` → `slack.posted` has a DM to the lead: "Offsite: which dates work? closed. 14 of 18 answered.", and `slack.updated` has the closed line in each unanswered DM. Home lists it under Closed.

## Gotchas

- The seed gives every invited recipient a stored DM, so closing edits the four that never answered.
- `slack` in `/api/dev/state` lives in the Worker's memory: a restart empties it, and `reset=1` clears it.
