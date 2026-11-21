# Make an API key

An owner or sender makes a key in Settings so a script can use Holler as them. `docs/api.md` owns the API.

## Reach

The header's **Settings** link, then the **API keys** section.

## Drive

[`api-keys.mjs`](api-keys.mjs) as `lead` from `/settings`: name a read-only key **Verify script**, press **Make key**, then reload.

## End state

The **API keys** region lists **Verify script** after a reload, and the empty line is gone.

## Gotchas

- The secret shows once. A recipe that needs to call the API with it must read it before leaving the page.
