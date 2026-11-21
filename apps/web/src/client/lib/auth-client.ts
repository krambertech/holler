import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { createAuthClient } from "better-auth/react";

/**
 * oauthProviderClient adds the consent page's signed `oauth_query` to sign-in and consent
 * calls, so a sign-in that started from an MCP client's authorize request resumes it, and it
 * types `authClient.oauth2.*` for the consent page.
 */
export const authClient = createAuthClient({ plugins: [oauthProviderClient()] });
