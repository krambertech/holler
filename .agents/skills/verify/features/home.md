# Home

The sender's list of their hollers, grouped into Live, Scheduled and Closed, with how many people answered each.

## Reach

`/`, or the **Holler home** link in the header.

## Drive

[`home.mjs`](home.mjs) as `lead`: check each group's count, check each live holler's answered count, then open the **Shared with me** tab.

## End state

The **Live**, **Scheduled** and **Closed** regions are named with the counts `/api/dev/state` reports, and each live holler shows `<answered> of <recipients>` from its stored recipients.

## Gotchas

- At 375 px the progress ring is hidden; match the `7 of 12` text, which shows at every width.
