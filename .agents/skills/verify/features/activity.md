# Activity in Settings

An owner reads every write in the workspace at the end of Settings, newest first, each as a sentence with where it came from and when. Senders never see it. `services/activity.ts` reads it for owners only; `components/settings/activity-row.tsx` says each action in words.

## Reach

The header's member, then **Settings**, then the **Activity** section at the end.

## Drive

[`activity.mjs`](activity.mjs) as `lead` from `/settings`: write a draft named **Activity check** through the API, reload, and find it at the top with a link to the draft; then switch to `sender` and look for the section.

## End state

The **Activity** list's first item says "Mira started the draft Activity check." and links to it, `GET /api/settings/activity` has `holler.created` from `web` first, and as `sender` the page has no **Activity** heading while `GET /api/settings/activity` answers `403`.

## Gotchas

- The dev seed writes its Hollers without Activity, so after a reset the list holds only what the recipe did.
