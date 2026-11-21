import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { type Auth, createAuth } from "./auth";
import { createDb, type Db } from "./db";
import { type Bindings, devKeyAccepted, devRoutesEnabled } from "./env";
import { handleMcpRequest } from "./mcp";
import { mountOpenApi } from "./openapi";
import { type Principal, principalFor } from "./principal";
import { billingRoutes } from "./routes/billing";
import { devRoutes } from "./routes/dev";
import { directoryRoutes } from "./routes/directory";
import { healthRoutes } from "./routes/health";
import { hollerRoutes } from "./routes/hollers";
import { installRoutes } from "./routes/install";
import { meRoutes } from "./routes/me";
import { ownAnswerRoutes } from "./routes/own-answers";
import { settingsRoutes } from "./routes/settings";
import { v1Routes } from "./routes/v1";
import { ServiceError } from "./services/context";
import { slackEventRoutes } from "./slack/events";
import { slackInteractionRoutes } from "./slack/interactions";
import { slackOAuthRoutes } from "./slack/oauth";

export type AppEnv = {
  Bindings: Bindings;
  Variables: {
    db: Db;
    auth: Auth;
    principal: Principal | null;
    now: () => Date;
  };
};

export const app = new Hono<AppEnv>();

app.use("*", secureHeaders());

app.use("*", async (c, next) => {
  const db = createDb(c.env.DB);
  c.set("db", db);
  c.set("auth", createAuth(c.env, db));
  c.set("now", () => new Date());
  c.set("principal", null);
  await next();
});

app.on(["GET", "POST"], "/api/auth/*", (c) => c.get("auth").handler(c.req.raw));

// OAuth discovery lives at the site root by RFC 8414 and RFC 9728; Better Auth answers it.
app.on(
  ["GET", "HEAD"],
  [
    "/.well-known/oauth-authorization-server",
    "/.well-known/oauth-authorization-server/*",
    "/.well-known/oauth-protected-resource",
    "/.well-known/oauth-protected-resource/*",
  ],
  (c) => c.get("auth").handler(c.req.raw),
);

// The MCP server. Its own authentication: an OAuth access token this Worker issued.
app.all("/mcp", (c) =>
  handleMcpRequest(c.req.raw, {
    auth: c.get("auth"),
    db: c.get("db"),
    env: c.env,
    now: c.get("now"),
  }),
);

// Public, so it sits before any authentication.
mountOpenApi(app);

/** Resolves the caller for every product API route. Routes that need one use `requireMember`. */
app.use("/api/*", async (c, next) => {
  // The public API resolves keys as well as sessions, in routes/v1.
  const own = ["/api/auth/", "/api/health", "/api/v1/", "/api/openapi.json"];
  if (!own.some((prefix) => c.req.path.startsWith(prefix))) {
    c.set("principal", await principalFor(c.get("auth"), c.get("db"), c.req.raw));
  }
  await next();
});

app.route("/api/health", healthRoutes);
app.route("/api/me", meRoutes);
app.route("/api/answers", ownAnswerRoutes);
app.route("/api/hollers", hollerRoutes);
app.route("/api/directory", directoryRoutes);
app.route("/api/settings", settingsRoutes);
app.route("/api/install", installRoutes);
app.route("/api/billing", billingRoutes);
app.route("/api/v1", v1Routes);
app.use("/api/dev/*", async (c, next) => {
  if (!devRoutesEnabled(c.env)) return c.notFound();
  if (!devKeyAccepted(c.env.DEV_ROUTES_KEY, c.req.header("x-holler-dev-key"))) {
    return c.notFound();
  }
  await next();
});
app.route("/api/dev", devRoutes);

app.route("/slack/oauth", slackOAuthRoutes);
app.route("/slack/events", slackEventRoutes);
app.route("/slack/interactions", slackInteractionRoutes);

app.all("/api/*", (c) =>
  c.json({ error: { code: "not_found", message: "There is no API route here." } }, 404),
);

app.onError((error, c) => {
  if (error instanceof ServiceError) {
    return c.json(
      {
        error: {
          code: error.code,
          message: error.message,
          field: error.field,
          problems: error.problems,
        },
      },
      error.status,
    );
  }
  if (error && typeof error === "object" && "issues" in error) {
    return c.json(
      {
        error: { code: "invalid", message: "Some fields need another look.", issues: error.issues },
      },
      400,
    );
  }
  console.error(error);
  return c.json(
    {
      error: { code: "internal", message: "Something on our side failed. Try again in a minute." },
    },
    500,
  );
});

/** Everything that is not an API, Slack or MCP path is the product SPA. */
app.all("*", async (c) => {
  // Asset responses have immutable headers; a copy lets secureHeaders add its own.
  const asset = await c.env.ASSETS.fetch(c.req.raw);
  return new Response(asset.body, asset);
});
