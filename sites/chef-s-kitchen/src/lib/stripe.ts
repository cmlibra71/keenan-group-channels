import { StripeSubscriptionProvider } from "@keenan/services";
import { resolveStripeGateway } from "@/lib/payments/gateway";

/**
 * Build a StripeSubscriptionProvider from the global payment_gateways setting,
 * picking the test or live entry (test mode applies in local dev OR when this
 * channel's portal "Payments test mode" toggle is on). Gateway resolution lives
 * in the shared resolveStripeGateway (lib/payments/gateway.ts). Shared by the
 * subscription + account server actions.
 */
export async function getStripeProvider(): Promise<StripeSubscriptionProvider> {
  const { gateway } = await resolveStripeGateway();
  if (!gateway?.credentials?.secret_key) {
    throw new Error(
      "Stripe is not configured. Set up the global Stripe gateway in the portal under Settings > Payments."
    );
  }
  return new StripeSubscriptionProvider(gateway.credentials.secret_key);
}
