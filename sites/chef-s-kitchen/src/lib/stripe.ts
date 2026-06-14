import { storeSettingsService } from "@/lib/store";
import { StripeSubscriptionProvider } from "@keenan/services";

/**
 * Build a StripeSubscriptionProvider from the global payment_gateways setting,
 * picking the entry tagged for the current environment (testMode in dev, live
 * in prod). Shared by the subscription + account server actions.
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
  const wantTestMode = process.env.NODE_ENV !== "production";
  const stripe =
    gateways.find(
      (g) => g.provider === "stripe" && g.enabled !== false && Boolean(g.testMode) === wantTestMode
    ) ?? (wantTestMode ? gateways.find((g) => g.provider === "stripe" && g.enabled !== false) : undefined);
  if (!stripe?.credentials?.secret_key) {
    throw new Error(
      "Stripe is not configured. Set up the global Stripe gateway in the portal under Settings > Payments."
    );
  }
  return new StripeSubscriptionProvider(stripe.credentials.secret_key);
}
