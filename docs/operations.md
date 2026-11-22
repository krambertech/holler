# Operations

Holler runs on Cloudflare Workers on the account's `workers.dev` subdomain until `holler.team` is set up. GitHub Actions deploys it; nobody deploys from a laptop.

| What | Worker | URL |
| --- | --- | --- |
| Product, API, Slack, MCP | `holler` | https://holler.k-porshnieva.workers.dev |
| Public site | `holler-site` | https://holler-site.k-porshnieva.workers.dev |
| Preview, following `main` | `holler-preview` | https://holler-preview.k-porshnieva.workers.dev |
| Preview of pull request `<n>` | `holler-preview` | `https://pr-<n>-holler-preview.k-porshnieva.workers.dev` |

`apps/web/wrangler.jsonc` holds the bindings: D1 `holler` and `holler-preview`, a KV namespace each for sessions, and the queues `holler-slack-sends` and `holler-preview-slack-sends`.

## Deploys

Merging to `main` is the deploy. The `deploy` job in `.github/workflows/ci.yml` waits for `ready`, which needs every other job, then:

1. applies new migrations to the production D1,
2. deploys `holler` and `holler-site` with the commit as the version tag,
3. polls each `/api/health` until it serves the version just deployed (`scripts/check-deployment.mjs`, with the id from `scripts/wrangler-version.mjs`),
4. does the same for the `holler-preview` base version.

A green deploy step does not prove the new version answers; step 3 does. Run `pnpm deploy:health` to see what production serves now. Every pull request also runs `pnpm deploy:check`, a dry run of both deploys.

Migrations reach production before the code that uses them, so a migration must work with the code already running: add columns and tables, and remove them only after a release that no longer reads them.

## Previews

The `preview` job uploads each pull request's build as a version of `holler-preview` at the alias `pr-<n>`, after migrating the preview D1. The job's environment link on the pull request opens it. Previews have no cron; close hollers with `/api/dev/tick`.

Previews run with `DEV_ROUTES=true` and seeded personas, never real Slack data. Because `workers.dev` is public, `/api/dev/*` answers only requests carrying the `x-holler-dev-key` header with the Worker's `DEV_ROUTES_KEY` secret. A preview alias reports an empty version tag at runtime, so CI and the verify doctor match the version id instead; the preview job's summary prints it. Drive a preview with the verify skill:

```bash
HOLLER_DEV_KEY=$(cat ~/.holler-dev-key) node .agents/skills/verify/scripts/run.mjs home --url https://pr-<n>-holler-preview.k-porshnieva.workers.dev --version <id> --pr <n>
```

Every pull request shares the preview D1. A branch's migration applies to it before merging, so keep migrations additive while they are open.

## When nobody is working on it

`weekly.yml` runs every Monday: CI on `main`, a high-severity audit of production dependencies, a ruleset check, and `pnpm deploy:health`. A failure opens an issue or comments on the open one. Each run enables the schedule because GitHub disables schedules after 60 days without commits.

`health.yml` asks production's `/api/health/work` every hour. It reads stored state for a send, invite, reminder or close more than 15 minutes late (`services/overdue.ts`), so it notices a stopped cron, a stuck queue and lost work alike, and opens an issue. Previews run no cron, so theirs is always late.

Dependabot checks for updates on Mondays, with a seven-day cooldown. It groups minor and patch package updates and GitHub Actions updates. `minimumReleaseAge` in `pnpm-workspace.yaml` also applies to manual installs.

## One-time setup

Kateryna does these; they handle credentials.

1. Create a Cloudflare API token from the **Edit Cloudflare Workers** template, adding **D1: Edit** and **Queues: Edit**, scoped to this account. Store it in GitHub without echoing it:

   ```bash
   gh secret set CLOUDFLARE_API_TOKEN -R krambertech/holler
   ```

2. After the first deploy from `main` creates the Workers, give them their secrets. Each value is generated and piped straight in, so nobody sees it:

   ```bash
   cd apps/web
   openssl rand -base64 32 | pnpm exec wrangler secret put BETTER_AUTH_SECRET
   openssl rand -base64 32 | pnpm exec wrangler secret put SLACK_TOKEN_KEY
   openssl rand -base64 32 | pnpm exec wrangler secret put BETTER_AUTH_SECRET --env preview
   openssl rand -base64 32 | pnpm exec wrangler secret put SLACK_TOKEN_KEY --env preview
   openssl rand -hex 24 > ~/.holler-dev-key && pnpm exec wrangler secret put DEV_ROUTES_KEY --env preview < ~/.holler-dev-key
   ```

   `SLACK_TOKEN_KEY` encrypts stored Slack tokens: changing it later makes every installed workspace reinstall. Slack and Polar secrets come with their own setup in `docs/slack.md` and `docs/billing.md`.

3. Protect `main`. Until the ruleset is installed, its merge requirements are not enforced:

   ```bash
   gh api -X POST repos/krambertech/holler/rulesets --input .github/rulesets/main.json
   ```

   Run it after `protect.yml` is on `main`, because GitHub runs `pull_request_target` workflows from there. Check it with `node scripts/check-ruleset.mjs`.

## Moving to holler.team

Change `PRODUCT_URL` and `PUBLIC_SITE_URL` in `apps/web/wrangler.jsonc`, `PRODUCT_URL` in `apps/site/src/urls.ts`, the origins in `package.json`'s `deploy:health` and in the `deploy` job, and the redirect URLs in `slack-app-manifest.json`. Add a `routes` entry with `custom_domain: true` for `app.holler.team` and `holler.team`.
