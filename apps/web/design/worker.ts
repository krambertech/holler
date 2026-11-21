// The design site's Worker at design.holler.team: a health answer, the SPA for /design paths,
// and its assets. Nothing else, and never indexed.
interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  CF_VERSION_METADATA: { id: string; tag: string };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    let response: Response;
    if (url.pathname === "/api/health") {
      response = Response.json({
        ok: true,
        worker: "holler-design",
        version: env.CF_VERSION_METADATA.id,
      });
    } else if (url.pathname === "/robots.txt") {
      response = new Response("User-agent: *\nDisallow: /\n", {
        headers: { "content-type": "text/plain" },
      });
    } else if (url.pathname === "/" || url.pathname === "/design" || url.pathname === "/design/") {
      response = new Response(null, { status: 302, headers: { location: "/design/brand" } });
    } else if (/^\/design\/(?:[^/.]+|components\/[^/.]+)\/?$/.test(url.pathname)) {
      url.pathname = "/index.html";
      response = await env.ASSETS.fetch(new Request(url, request));
    } else if (url.pathname.startsWith("/assets/")) {
      response = await env.ASSETS.fetch(request);
    } else {
      response = new Response("Not found", { status: 404 });
    }
    response = new Response(response.body, response);
    response.headers.set("x-robots-tag", "noindex, nofollow");
    response.headers.set("x-content-type-options", "nosniff");
    return response;
  },
};
