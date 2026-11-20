import type { ApiError as ApiErrorBody } from "@holler/core";

/** Any non-2xx answer from /api. `field` names the input at fault when the server knows it. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, ...rest } = init;
  const response = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...rest,
    headers: {
      accept: "application/json",
      ...(json === undefined ? {} : { "content-type": "application/json" }),
      ...rest.headers,
    },
    ...(json === undefined ? {} : { body: JSON.stringify(json) }),
  });
  if (response.ok) return (await response.json()) as T;
  let body: Partial<ApiErrorBody> = {};
  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {}
  throw new ApiError(
    response.status,
    body.error?.code ?? "unknown",
    body.error?.message ?? "Something failed. Try again in a minute.",
    body.error?.field,
  );
}
