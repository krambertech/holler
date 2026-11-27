# Delete the workspace's data

An owner deletes everything Holler keeps for the workspace from the last section of Settings, after typing the workspace's name, and lands on Sign in with a line saying it is done.

## Reach

Settings, the **Workspace data** section at the end, which only owners see.

## Drive

[`workspace-deletion.mjs`](workspace-deletion.mjs) as `lead`: open the section, open the dialog, check **Delete data** stays asleep until the name is typed in full, confirm, then check that the session ended and that signing in as `lead` again seeds a fresh Northwind.

## End state

Sign in to Holler shows "Northwind’s data is deleted". `/api/auth/get-session` is null. Signing in as `lead` again shows the seeded hollers.

## Gotchas

- The recipe really deletes the local dev workspace. The next dev sign-in seeds it again, so it never needs a manual reset, but run it on its own and never against a shared preview someone else is using.
- The uninstalled states (the date in Settings, on Home's notice and in the Workspace plate) need `uninstalled_at` set, which no sender action does. `pnpm exec wrangler d1 execute holler --local --command "UPDATE workspaces SET uninstalled_at = <ms>"` in `apps/web` shows them.
