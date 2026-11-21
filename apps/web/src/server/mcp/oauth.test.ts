import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../app";
import type { Db } from "../db";
import type { Bindings } from "../env";
import { principalForMcp } from "../principal";
import { testEnv } from "../routes/v1/test-env";

/**
 * The whole connection, as an MCP client makes it: discovery, registration, sign-in, the
 * consent page's decision, the token, then tool calls. It proves a token carries the member
 * it was granted for and that disconnecting stops it at once.
 */

let env: Bindings;
let db: Db;
let dispose: () => Promise<void>;
beforeAll(async () => ({ env, db, dispose } = await testEnv()));
afterAll(() => dispose());

const origin = "http://localhost:5280";
const redirectUri = "http://127.0.0.1:9999/callback";

function request(path: string, init: RequestInit = {}) {
  return app.request(`${origin}${path}`, init, env);
}

async function pkce() {
  const verifier = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
  return { verifier, challenge };
}

function cookiesOf(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

async function connectClient(scope = "read write offline_access") {
  const registered = await request("/api/auth/oauth2/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "Test assistant",
      application_type: "native",
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: "read write offline_access",
    }),
  });
  expect(registered.status, await registered.clone().text()).toBeLessThan(300);
  const { client_id: clientId } = (await registered.json()) as { client_id: string };

  const signIn = await request("/api/dev/sign-in?as=lead");
  const cookie = cookiesOf(signIn);
  expect(cookie).toMatch(/session_token/);

  const { verifier, challenge } = await pkce();
  const authorize = await request(
    `/api/auth/oauth2/authorize?${new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope,
      state: "state-1",
      code_challenge: challenge,
      code_challenge_method: "S256",
      resource: `${origin}/mcp`,
    })}`,
    { headers: { cookie } },
  );
  const consentPage = new URL(authorize.headers.get("location") ?? "", origin);
  expect(consentPage.pathname).toBe("/consent");

  const decided = await request("/api/auth/oauth2/consent", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ accept: true, oauth_query: consentPage.search.slice(1) }),
  });
  expect(decided.status, await decided.clone().text()).toBe(200);
  const { url } = (await decided.json()) as { url?: string; redirect_uri?: string };
  const code = new URL(url ?? "").searchParams.get("code");
  expect(code).toBeTruthy();

  const token = await request("/api/auth/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: code ?? "",
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: verifier,
      resource: `${origin}/mcp`,
    }),
  });
  expect(token.status, await token.clone().text()).toBe(200);
  const { access_token: accessToken } = (await token.json()) as { access_token: string };
  return { clientId, cookie, accessToken };
}

/** The legacy stateless leg answers as one SSE event; the modern one as JSON. */
async function rpcResult<T>(response: Response): Promise<T> {
  const text = await response.text();
  const data = text.startsWith("{")
    ? text
    : (text
        .split("\n")
        .find((line) => line.startsWith("data: "))
        ?.slice(6) ?? "{}");
  return (JSON.parse(data) as { result: T }).result;
}

function mcp(accessToken: string | null, body: unknown) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": "2025-06-18",
  };
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  return request("/mcp", { method: "POST", headers, body: JSON.stringify(body) });
}

describe("discovery", () => {
  it("challenges a request with no token toward the protected resource metadata", async () => {
    const response = await mcp(null, { jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toMatch(/oauth-protected-resource\/mcp/);
  });

  it("publishes the protected resource and the authorization server", async () => {
    const resource = await request("/.well-known/oauth-protected-resource/mcp");
    expect(resource.status).toBe(200);
    expect(await resource.json()).toMatchObject({ resource: `${origin}/mcp` });
    const server = await request("/.well-known/oauth-authorization-server/api/auth");
    expect(server.status).toBe(200);
    const metadata = (await server.json()) as Record<string, unknown>;
    expect(metadata.registration_endpoint).toBeTruthy();
    expect(metadata.client_id_metadata_document_supported).toBe(true);
  });
});

describe("a connected app", () => {
  it("calls tools as the member it was granted for, until it is disconnected", async () => {
    const { accessToken, cookie } = await connectClient();

    const listed = await mcp(accessToken, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "list_hollers", arguments: {} },
    });
    expect(listed.status, await listed.clone().text()).toBe(200);
    const body = await rpcResult<{ structuredContent: { hollers: { title: string }[] } }>(listed);
    expect(body.structuredContent.hollers.length).toBeGreaterThan(0);

    // Settings lists it, then disconnects it.
    const apps = await request("/api/v1/connected-apps", { headers: { cookie } });
    const [connected] = (await apps.json()) as { id: string; name: string; scope: string }[];
    expect(connected).toMatchObject({ name: "Test assistant", scope: "write" });
    const disconnected = await request(`/api/v1/connected-apps/${connected?.id}`, {
      method: "DELETE",
      headers: { cookie },
    });
    expect(disconnected.status).toBe(200);

    const after = await mcp(accessToken, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "list_hollers", arguments: {} },
    });
    expect(after.status).toBe(401);
  });

  it("is read-only when the person granted only read", async () => {
    const { accessToken } = await connectClient("read offline_access");
    const created = await mcp(accessToken, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "create_holler", arguments: { mode: "pulse", title: "Hi" } },
    });
    const body = await rpcResult<{ isError: boolean }>(created);
    expect(body.isError).toBe(true);
  });

  it("refuses a token whose claims name no member", async () => {
    const refused = await principalForMcp(db, { sub: "someone", client_id: "client" });
    expect(refused).toMatchObject({ status: 401 });
  });
});
