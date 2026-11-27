# A repeating pulse shows its rounds and stops repeating

Every round of a repeating pulse is its own Holler, and each round's page lists the series side by side: the date, whether it is live, closed or next, the average of its first scale question and how many answered. **Stop repeating** in the menu asks once, then deletes the scheduled next round and keeps every round so far. `listRounds` and `stopRepeating` in `services/rounds.ts` do the work; `components/results/holler-rounds.tsx` draws the list.

## Reach

Home, then the live **How was your week?** pulse. The seed makes it the second round of a weekly series: a closed first round 40 days ago, this live round, and a scheduled next round in five days.

## Drive

[`rounds.mjs`](rounds.mjs) as `lead`: open the pulse, check the Rounds list matches `GET /api/hollers/<id>/rounds`, open the closed round from the list, come back, then **Stop repeating** from the menu and confirm.

## End state

`GET /api/hollers/<id>/rounds` → `repeat` is null and no round is scheduled, the two sent rounds keep their answers, and `/api/dev/state` has a `holler.repeat_stopped` Activity row from `web`. The list says "This pulse no longer repeats." and the menu has no Stop repeating.

## Gotchas

- The list shows only when the series has more than one round, so a first round with nothing scheduled after it has no Rounds section.
