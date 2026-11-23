import { Hono } from "hono";
import type { AppEnv } from "../app";
import { productUrl } from "../product-url";
import { billingOverview, openPortal, polarGateway, startCheckout } from "../services/billing";
import { requireMember } from "./context";

/**
 * The Billing section of Settings. Any member reads the plan and this month's usage; only owners start a
 * checkout or open the Polar portal. Polar's webhooks arrive at /api/auth/polar/webhooks through
 * the Better Auth plugin in auth.ts, not here.
 */
export const billingRoutes = new Hono<AppEnv>()
  .get("/", async (c) => c.json(await billingOverview(requireMember(c))))
  .post("/checkout", async (c) => {
    return c.json(
      await startCheckout(requireMember(c), polarGateway(c.env), {
        successUrl: `${productUrl(c.env, "/settings")}?checkout={CHECKOUT_ID}#billing`,
        returnUrl: productUrl(c.env, "/settings", { hash: "billing" }),
      }),
    );
  })
  .post("/portal", async (c) =>
    c.json(
      await openPortal(
        requireMember(c),
        polarGateway(c.env),
        productUrl(c.env, "/settings", { hash: "billing" }),
      ),
    ),
  );
