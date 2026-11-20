import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { type Auth, createAuth } from "./auth";
import { createDb, type Db } from "./db";
import { type Bindings, devRoutesEnabled } from "./env";
import { type Principal, principalFor } from "./principal";
import { devRoutes } from "./routes/dev";
import { directoryRoutes } from "./routes/directory";
import { healthRoutes } from "./routes/health";
import { hollerRoutes } from "./routes/hollers";
import { meRoutes } from "./routes/me";
import { ServiceError } from "./services/context";

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

/** Resolves the caller for every product API route. Routes that need one use `requireMember`. */
app.use("/api/*", async (c, next) => {
  if (!c.req.path.startsWith("/api/auth/") && !c.req.path.startsWith("/api/health")) {
    c.set("principal", await principalFor(c.get("auth"), c.get("db"), c.req.raw));
  }
  await next();
});

app.route("/api/health", healthRoutes);
app.route("/api/me", meRoutes);
app.route("/api/hollers", hollerRoutes);
app.route("/api/directory", directoryRoutes);
app.use("/api/dev/*", async (c, next) => {
  if (!devRoutesEnabled(c.env)) return c.notFound();
  await next();
});
app.route("/api/dev", devRoutes);

app.all("/api/*", (c) =>
  c.json({ error: { code: "not_found", message: "There is no API route here." } }, 404),
);

app.onError((error, c) => {
  if (error instanceof ServiceError) {
    return c.json(
      { error: { code: error.code, message: error.message, field: error.field } },
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
