# Holler

Ask your team in Slack. Holler sends your question to each person, reminds the ones who have not answered, and shows you the results. Pulses, surveys and form chases, with an API and an MCP server.

The source is public to read. It is not open source: see [LICENSE](LICENSE).

## Layout

| Path              | What it is                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------- |
| `apps/web`        | The product at `app.holler.team`: a Vite React app and a Hono Worker serving the API, Slack endpoints and MCP |
| `apps/site`       | The public site at `holler.team`: Astro, static, with a health Worker                                         |
| `packages/core`   | Drizzle schema, Zod types, plans, results maths, the reminder rhythm                                          |
| `packages/design` | Tokens, fonts, the logo geometry, contrast pairs                                                              |
| `e2e`             | Playwright journeys with axe                                                                                  |
| `scripts`         | Repo checks                                                                                                   |
| `docs`            | Stack, data model, Slack, testing, git workflow, work areas                                                   |

## Start

Holler needs Node 24 and pnpm 10.

```bash
pnpm install
```

```bash
cp apps/web/.dev.vars.example apps/web/.dev.vars
```

Add `DEV_ROUTES=true` to `apps/web/.dev.vars`, then create the local database:

```bash
pnpm db:migrate
```

```bash
pnpm dev
```

Open `http://localhost:5280/api/dev/sign-in?as=lead` to sign in as the seeded lead. The site runs on port 5281. Every component, in both themes, is at `http://localhost:5280/design`.

## Commands

| Command            | What it does                                        |
| ------------------ | --------------------------------------------------- |
| `pnpm verify`      | Every check, test and build. Run it before you push |
| `pnpm test`        | Unit and service tests                              |
| `pnpm test:e2e`    | Browser journeys in Chromium and WebKit             |
| `pnpm fix`         | Biome's formatting and lint fixes                   |
| `pnpm db:generate` | A migration from schema changes                     |

[AGENTS.md](AGENTS.md) has the working agreements; [docs/stack.md](docs/stack.md) has every technical decision.
