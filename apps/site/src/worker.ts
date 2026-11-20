/** The site's Worker: a health answer, then the prerendered pages. */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/health" && request.method === "GET") {
      return Response.json({
        ok: true,
        worker: "holler-site",
        version: env.CF_VERSION_METADATA.id,
        tag: env.CF_VERSION_METADATA.tag || null,
      });
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
