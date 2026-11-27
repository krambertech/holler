# Sharing the results

The creator of a sent Holler shares its results from **Share** on the Holler page: with everyone in the workspace, with people picked by name from Slack, and through a report link anyone can open. Each person added gets one message in Slack. The report names no one. `components/results/share-dialog.tsx` and `report-view.tsx` draw it; `services/sharing.ts` does the work, and `withoutNames` in `packages/core/src/results.ts` takes the people out of a report.

## Reach

Home, then the live **How was your week?** pulse, then **Share**.

## Drive

[`sharing.mjs`](sharing.mjs) as `lead`: open the dialog, add the first person the picker offers, check their Slack message, make the report link, open it in a context with no session, then turn the link off and open it again.

## End state

`/api/dev/state` → `slack.posted` has one message to the person added that says the results were shared with them, and `activity` has `viewer.added` and `report_link.made` from `web`. `GET /api/report/<token>` answers without a session and holds no Slack id that the Holler's own results hold. After **Turn off**, the same link shows "This report is not available".

## Gotchas

- The report link uses `PRODUCT_URL`, which names the deployed host even in dev; the recipe opens its path on the instance it drives.
- Adding someone already shared with changes nothing, so the picker marks them "Already shared with them".
