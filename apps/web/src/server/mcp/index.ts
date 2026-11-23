import { requireMcpAuth } from "@better-auth/mcp";
import { createMcpHandler } from "@modelcontextprotocol/server";
import type { Auth } from "../auth";
import type { Db } from "../db";
import type { Bindings } from "../env";
import { principalForMcp } from "../principal";
import { buildMcpServer, type McpPrincipal } from "./server";

export const MCP_CHALLENGE_SCOPES = ["read", "write", "offline_access"] as const;

type ProductOrigin = { PRODUCT_URL: string };

export function mcpResource(env: ProductOrigin): string {
  return `${env.PRODUCT_URL}/mcp`;
}

export function mcpResourceMetadataUrl(env: ProductOrigin): string {
  return new URL("/.well-known/oauth-protected-resource/mcp", env.PRODUCT_URL).toString();
}

export function handleMcpRequest(
  request: Request,
  deps: { auth: Auth; db: Db; env: Bindings; now: () => Date },
): Promise<Response> {
  const handler = requireMcpAuth(
    deps.auth,
    async (req, claims) => {
      const principal = await principalForMcp(deps.db, claims);
      if ("status" in principal) return unauthorized(deps.env, principal.message);
      return handleVerifiedMcpRequest(req, {
        principal,
        ctx: {
          db: deps.db,
          workspaceId: principal.workspaceId,
          actor: principal.actor,
          now: deps.now,
        },
        env: deps.env,
        resourceMetadataUrl: mcpResourceMetadataUrl(deps.env),
      });
    },
    { resource: mcpResource(deps.env), challengeScopes: MCP_CHALLENGE_SCOPES },
  );
  return handler(request);
}

export function handleVerifiedMcpRequest(req: Request, principal: McpPrincipal): Promise<Response> {
  const handler = createMcpHandler(() => buildMcpServer(principal));
  return handler.fetch(req);
}

function unauthorized(env: ProductOrigin, message: string): Response {
  const challenge = [
    `resource_metadata="${mcpResourceMetadataUrl(env)}"`,
    `scope="${MCP_CHALLENGE_SCOPES.join(" ")}"`,
    `error="invalid_token"`,
    `error_description="${message}"`,
  ].join(", ");
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }),
    {
      status: 401,
      headers: { "content-type": "application/json", "www-authenticate": `Bearer ${challenge}` },
    },
  );
}
