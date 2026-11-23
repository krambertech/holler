import { apiErrorSchema } from "@holler/core";
import type { Context, MiddlewareHandler, ValidationTargets } from "hono";
import {
  type DescribeRouteOptions,
  describeRoute,
  resolver,
  uniqueSymbol,
  validator,
} from "hono-openapi";
import type { ZodType } from "zod";
import type { AppEnv } from "../../app";
import { apiKeyFrom, principalFor, principalForApiKey } from "../../principal";
import { ServiceError } from "../../services/context";

export const authenticate: MiddlewareHandler<AppEnv> = async (c, next) => {
  const key = apiKeyFrom(c.req.raw);
  const principal = key
    ? await principalForApiKey(c.get("auth"), c.get("db"), key)
    : await principalFor(c.get("auth"), c.get("db"), c.req.raw);
  if (!principal) {
    return c.json(
      {
        error: {
          code: "unauthorized",
          message: "Send an API key as `Authorization: Bearer hlr_…`. Make one in Settings.",
        },
      },
      401,
    );
  }
  if ("status" in principal) {
    if (principal.retryAfter) c.header("retry-after", String(principal.retryAfter));
    return c.json(
      { error: { code: principal.code, message: principal.message } },
      principal.status,
    );
  }
  c.set("principal", principal);
  await next();
};

export function input<T extends ZodType, Target extends keyof ValidationTargets>(
  target: Target,
  schema: T,
) {
  return validator(target, schema, (result) => {
    if (result.success) return;
    const issue = result.error[0];
    const path =
      issue?.path?.map((p) => (typeof p === "object" ? p.key : p)).join(".") || undefined;
    throw new ServiceError(
      "invalid",
      path
        ? `Check ${path}: ${issue?.message ?? "it is not valid"}.`
        : (issue?.message ?? "Check the request."),
      path,
    );
  });
}

type Responses = NonNullable<DescribeRouteOptions["responses"]>;
type Ok = { status?: number; schema?: ZodType; description: string; media?: string[] };
type ErrorStatus = 400 | 402 | 404 | 409 | 410 | 503;

export function describe(
  spec: Omit<DescribeRouteOptions, "responses" | "security"> & {
    ok: Ok;
    errors?: ErrorStatus[];
    sessionOnly?: boolean;
  },
) {
  const { ok, errors = [], sessionOnly = false, ...rest } = spec;
  const responses: Responses = {
    [String(ok.status ?? 200)]: {
      description: ok.description,
      content: Object.fromEntries(
        (ok.media ?? ["application/json"]).map((media) => [
          media,
          ok.schema && media === "application/json"
            ? { schema: resolver(ok.schema) }
            : { schema: { type: "string" as const } },
        ]),
      ),
    },
  };
  for (const status of [401, 403, 429, ...errors] as const) {
    responses[String(status)] = errorResponse(status);
  }
  const documented = describeRoute({
    ...rest,
    ...(sessionOnly ? { security: [{ session: [] }] } : {}),
    responses,
  });
  const guarded: MiddlewareHandler<AppEnv> = async (c, next) => {
    const principal = c.get("principal");
    if (sessionOnly && principal?.actor.via !== "web") {
      return forbidden(c, "Only you can do this, signed in to Holler on the web.");
    }
    const reads = c.req.method === "GET" || c.req.method === "HEAD";
    if (!reads && principal?.scope !== "write") {
      return forbidden(c, "This key can only read. Make a key with write access in Settings.");
    }
    await next();
  };
  return Object.assign(guarded, {
    [uniqueSymbol]: (documented as unknown as Record<symbol, unknown>)[uniqueSymbol],
  });
}

function forbidden(c: Context<AppEnv>, message: string) {
  return c.json({ error: { code: "forbidden", message } }, 403);
}

export function errorResponse(status: keyof typeof ERRORS) {
  return {
    description: ERRORS[status],
    content: { "application/json": { schema: resolver(apiErrorSchema) } },
  };
}

const ERRORS = {
  400: "The request did not validate. `field` names the first input at fault.",
  401: "No API key or session, or one that is not valid.",
  402: "The workspace reached its monthly limit on the Free plan.",
  403: "The caller may not do this: a read-only key on a write, or a key on a web-only route.",
  404: "Not found, or not shared with the caller.",
  409: "The change collides with the Holler's state, or an Idempotency-Key was reused with a different body.",
  410: "The Holler is closed.",
  429: "The key made too many requests. `Retry-After` gives the seconds to wait.",
  503: "Holler cannot reach Slack, or the feature is not switched on yet.",
} as const;
