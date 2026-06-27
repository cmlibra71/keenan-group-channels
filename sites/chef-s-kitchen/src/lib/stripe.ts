import { storeSettingsService, wantStripeTestMode } from "@/lib/store";
import { StripeSubscriptionProvider, selectGateway } from "@keenan/services";

/**
 * Build a StripeSubscriptionProvider from the global payment_gateways setting,
 * picking the test or live entry. Test mode applies in local dev (NODE_ENV) OR
 * when this channel's portal "Payments test mode" toggle is on — letting the live
 * site run entirely on the test Stripe account. Shared by the subscription +
 * account server actions.
 */
export async function getStripeProvider(): Promise<StripeSubscriptionProvider> {
  const settings = await storeSettingsService.getByKey("payment_gateways");
  const gateways =
    (settings.setting_value as {
      provider: string;
      credentials: Record<string, string>;
      enabled?: boolean;
      testMode?: boolean;
    }[]) || [];
  const wantTestMode = await wantStripeTestMode();
  const stripe = selectGateway(
    gateways.filter((g) => g.provider === "stripe" && g.enabled !== false),
    wantTestMode
  );
  if (!stripe?.credentials?.secret_key) {
    throw new Error(
      "Stripe is not configured. Set up the global Stripe gateway in the portal under Settings > Payments."
    );
  }
  return new StripeSubscriptionProvider(stripe.credentials.secret_key);
}
