import { testRule } from "../test/run.mjs";

const filename = "link.tsx";

testRule("product-links", {
  message:
    "Nothing checks this path against the product's pages, so it can open the not-found page. In the client " +
    "use <Link to> or navigate({ to }), with reloadDocument for a full load; on the server use " +
    "productUrl(env, page) or productPath(page). Only /api/, /slack/, /mcp and /.well-known/ may be written out.",
  valid: [
    { filename, code: 'const a = <Link to="/hollers/$id" params={{ id }} />;' },
    { filename, code: 'const a = <a href="/slack/oauth/install" />;' },
    { filename, code: "const a = <a href={`/api/dev/sign-in?as=lead&to=${to}`} />;" },
    { filename, code: "const a = <a href={holler.externalUrl} />;" },
    { filename, code: 'const a = <a href="https://slack.com/apps" />;' },
    { filename, code: 'const a = <a href="#actions" />;' },
    { filename, code: 'const a = <a href={waitingFor("#11", "/new")} />;' },
    { filename, code: 'navigate({ to: "/sign-in", reloadDocument: true });' },
    { filename, code: "window.location.assign(checkout.url);" },
    { filename, code: 'throw redirect({ to: "/install" });' },
    { filename, code: "const url = `${env.PRODUCT_URL}/mcp`;" },
    { filename, code: "const url = `${env.PRODUCT_URL}/slack/oauth/callback`;" },
    { filename, code: 'const url = new URL("/.well-known/oauth", env.PRODUCT_URL);' },
    { filename, code: 'const url = `${productUrl(env, "/settings")}?checkout={CHECKOUT_ID}`;' },
    { filename, code: 'app.get("/install", (c) => c.redirect(toInstallPage("denied")));' },
  ],
  invalid: [
    {
      filename,
      code: "navigate({ href: `/new?draft=${encodeURIComponent(draft.id)}` });",
      errors: ["href: `/new?draft=${encodeURIComponent(draft.id)}`"],
    },
    {
      filename,
      code: "const a = <a href={`/answers/${holler.id}`} />;",
      errors: ["`/answers/${holler.id}`"],
    },
    { filename, code: 'const a = <a href="/new" />;', errors: ['"/new"'] },
    {
      filename,
      code: 'const a = <a href={"/new?draft=" + id} />;',
      errors: ['"/new?draft=" + id'],
    },
    { filename, code: 'const a = <a href={url ?? "/new"} />;', errors: ['url ?? "/new"'] },
    { filename, code: 'window.location.assign("/sign-in");', errors: ['"/sign-in"'] },
    { filename, code: 'window.location.href = "/sign-in";', errors: ['"/sign-in"'] },
    { filename, code: 'router.history.push("/new");', errors: ['"/new"'] },
    { filename, code: 'throw redirect({ href: "/sign-in" });', errors: ['href: "/sign-in"'] },
    {
      filename,
      code: "const url = `${env.PRODUCT_URL}/hollers/${row.id}/edit`;",
      errors: ["`${env.PRODUCT_URL}/hollers/${row.id}/edit`"],
    },
    {
      filename,
      code: 'const url = `${productUrl(env, "/hollers/$id", { params })}/edit`;',
      errors: ['`${productUrl(env, "/hollers/$id", { params })}/edit`'],
    },
    {
      filename,
      code: "const url = link('Open', `${state.productUrl}/new`);",
      errors: ["`${state.productUrl}/new`"],
    },
    { filename, code: 'const u = env.PRODUCT_URL + "/new";', errors: ['env.PRODUCT_URL + "/new"'] },
    { filename, code: 'const u = new URL("/new", env.PRODUCT_URL);', errors: ['"/new"'] },
    {
      filename,
      code: "c.redirect(`/install?problem=${problem}`);",
      errors: ["`/install?problem=${problem}`"],
    },
    { filename, code: 'const o = { loginPage: "/sign-in" };', errors: ['"/sign-in"'] },
  ],
});
