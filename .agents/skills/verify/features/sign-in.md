# Sign in and sign out

A member signs in with Slack and lands on Home. Locally, `/api/dev/sign-in?as=<persona>` stands in for Slack: `lead` is an owner with live, scheduled and closed hollers, and `sender` has nothing yet, for the empty states. `apps/web/src/server/services/dev-seed.ts` owns the personas.

## Reach

The Slack sign-in page at `/sign-in`, or any product URL while signed out.

## Drive

[`sign-in.mjs`](sign-in.mjs): land on Home as `lead`, switch to `sender`, then sign out from the account menu.

## End state

Home's heading reads **Your hollers** and the header's account button is named **Mira Kask, account**. `/api/dev/state` reports `persona: lead` with role `owner`, then `persona: sender` with role `sender`. After **Sign out**, the page is **Sign in to Holler**, `/api/auth/get-session` answers `null`, and `/` sends you to `/sign-in`.

## Gotchas

- The real Slack round trip needs a Slack app and a public URL; this recipe proves the session and the landing, not Slack's OAuth.
