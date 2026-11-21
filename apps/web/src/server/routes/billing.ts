import { Hono } from "hono";
import type { AppEnv } from "../app";
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
    const settings = `${c.env.PRODUCT_URL}/settings`;
    return c.json(
      await startCheckout(requireMember(c), polarGateway(c.env), {
        successUrl: `${settings}?checkout={CHECKOUT_ID}#billing`,
        returnUrl: `${settings}#billing`,
      }),
    );
  })
  .post("/portal", async (c) =>
    c.json(
      await openPortal(
        requireMember(c),
        polarGateway(c.env),
        `${c.env.PRODUCT_URL}/settings#billing`,
      ),
    ),
  );
