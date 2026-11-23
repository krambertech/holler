import { isPublicRoutableHost } from "@better-auth/core/utils/host";
import type { ClientMetadataResourceFetch } from "@better-auth/oauth-provider";

export const fetchClientMetadataResource: ClientMetadataResourceFetch = async (input, init) => {
  const request = new Request(input, { ...init, redirect: "manual" });
  const url = new URL(request.url);
  if (url.protocol !== "https:") {
    throw new TypeError("Client metadata documents must be served over HTTPS.");
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    throw new TypeError("Client metadata documents are fetched with GET or HEAD only.");
  }
  if (!isPublicRoutableHost(url.hostname)) {
    throw new TypeError("Client metadata documents must live on a public host.");
  }
  return fetch(request);
};
