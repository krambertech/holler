import type { Hono } from "hono";
import { openAPIRouteHandler } from "hono-openapi";
import type { AppEnv } from "./app";

export function mountOpenApi(app: Hono<AppEnv>) {
  app.use("/api/openapi.json", async (c, next) => {
    await next();
    if (c.req.header("origin") === new URL(c.env.PUBLIC_SITE_URL).origin) {
      c.header("access-control-allow-origin", c.req.header("origin"));
      c.header("vary", "Origin", { append: true });
    }
  });

  app.get(
    "/api/openapi.json",
    openAPIRouteHandler(app, {
      exclude: [/^(?!\/api\/v1\/)/],
      documentation: {
        openapi: "3.1.0",
        info: {
          title: "Holler API",
          version: "1",
          description: [
            "The same Holler as the web app and Slack, for scripts. Everything here calls the same rules: an anonymous Holler's results stay gated until five people answer, and a Free workspace's monthly limit holds.",
            "",
            "**Authentication.** Send an API key as `Authorization: Bearer hlr_…` (or in `x-api-key`). Make one in Settings. A key acts as the member who made it, in the workspace it was made in. A `read` key can list and read; a `write` key can also create, update, send, close and remind.",
            "",
            '**Errors.** Every error is `{ "error": { "code", "message", "field" } }`. The message is written for a person and says what to do next.',
            "",
            "**Retries.** Creating a Holler takes an `Idempotency-Key` header, so a retried call never makes a second draft.",
          ].join("\n"),
        },
        servers: [{ url: "https://app.holler.team", description: "Holler" }],
        components: {
          securitySchemes: {
            apiKey: {
              type: "http",
              scheme: "bearer",
              description: "An API key from Settings. It starts with `hlr_`.",
            },
            session: {
              type: "apiKey",
              in: "cookie",
              name: "holler.session_token",
              description: "The web app's own session. Web-only routes need it.",
            },
          },
        },
        security: [{ apiKey: [] }],
        tags: [
          {
            name: "Hollers",
            description:
              "One ask sent to a set of people: its questions, recipients, schedule and results.",
          },
          { name: "Directory", description: "People and groups a Holler can be sent to." },
          { name: "Account", description: "Who the credential acts as." },
          {
            name: "API keys",
            description: "Web only: no key can list, make or revoke a key.",
          },
          {
            name: "Connected apps",
            description: "Web only: the MCP clients a member allowed to act for them.",
          },
        ],
      },
    }),
  );
}
