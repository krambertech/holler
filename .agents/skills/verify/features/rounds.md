# A repeating pulse shows its rounds, changes how often it repeats, and stops

Every round of a repeating pulse is its own Holler, and each round's page lists the series side by side: the date, whether it is live, closed or next, the average of its first scale question and how many answered. Its creator gets a menu on the Rounds plate, beside **Edit next round**: **Every week** and **Every fortnight** change the rule for the whole series and move the scheduled next round to match, and **Stop repeating** asks once, then deletes the scheduled next round and keeps every round so far. `listRounds`, `changeRepeat` and `stopRepeating` in `services/rounds.ts` do the work; `components/results/holler-rounds.tsx` draws the list and the menu.

## Reach

Home, then the live **How was your week?** pulse. The seed makes it the second round of a weekly series: a closed first round 44 days ago, this live round two days ago, six weeks after it, and a scheduled next round in five days.

## Drive

[`rounds.mjs`](rounds.mjs) as `lead`: open the pulse, check the Rounds list matches `GET /api/hollers/<id>/rounds`, open the closed round from the list, come back, choose **Every fortnight** from the **Repeats every week** menu, then **Stop repeating** from the same menu and confirm.

## End state

After **Every fortnight**: `repeat` is `fortnight`, the next round goes out twelve days from now, two weeks on from the first round's day, and `/api/dev/state` has a `holler.repeat_changed` Activity row from `web`. After **Stop repeating**: `repeat` is null and no round is scheduled, the two sent rounds keep their answers, Activity has a `holler.repeat_stopped` row from `web`, the list says "This pulse no longer repeats." and the menu is gone.

## Gotchas

- The list shows while the series repeats or has more than one round, so a first round with nothing after it and no rule has no Rounds section.
- A change counts rounds from the first round's day, so a fortnight lands on the first round's fortnightly days, not two weeks after the latest round.
