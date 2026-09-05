import { getCart } from "@/lib/actions/cart";
import { getSession } from "@/lib/auth";
import { getFeatureFlag, getSubscriptionPlans, getActiveSubscriptionForContact, getCheckoutSettings, channelSettingsService, CHANNEL_ID } from "@/lib/store";
import { CartPageClient } from "@/components/cart/CartPageClient";
import { activeBrandFreeShippingSpecials } from "@/lib/checkout/free-shipping-brands";
import { Ga4ViewCart } from "@/components/analytics/Ga4ViewCart";

export const metadata = {
  title: "Cart",
};

/**
 * Thin server wrapper: initial cart + settings/upsell eligibility are read
 * server-side once; all interaction (quantities, totals, empty-state swap)
 * lives in the CartPageClient island — no route re-render on mutations.
 */
export default async function CartPage() {
  const cart = await getCart();
  const items = cart?.items ?? [];

  // Check tax mode
  let pricesIncludeTax = false;
  try {
    const taxSetting = await channelSettingsService.getByKey(CHANNEL_ID, "prices_include_tax");
    pricesIncludeTax = taxSetting.setting_value === true || taxSetting.setting_value === "true";
  } catch {}

  // Check membership upsell eligibility
  let showUpsell = false;
  let planPrice = 0;
  let billingInterval = "month";
  let isMember = false;

  const [subscriptionsEnabled, checkoutSettings, brandSpecials] = await Promise.all([
    getFeatureFlag("subscriptions_enabled"),
    getCheckoutSettings(),
    // Brand free-shipping specials running today (card 88Ay7UGA). Handed to the
    // island rather than resolved here, because the island re-decides after every
    // quantity change and removal.
    activeBrandFreeShippingSpecials(),
  ]);
  if (subscriptionsEnabled && items.length > 0) {
    const session = await getSession();
    if (session) {
      const activeSub = await getActiveSubscriptionForContact(session.contactId);
      isMember = !!activeSub;
    }
    if (!isMember) {
      const plans = await getSubscriptionPlans();
      if (plans.length > 0) {
        showUpsell = true;
        planPrice = parseFloat(plans[0].price);
        billingInterval = plans[0].billing_interval;
      }
    }
  }

  const total = parseFloat(cart?.cart_amount ?? "0");

  return (
    <>
      {items.length > 0 && (
        <Ga4ViewCart value={total} items={items as Record<string, unknown>[]} />
      )}
      <CartPageClient
        initialCart={
          cart
            ? {
                items: items as never,
                cart_amount: (cart.cart_amount as string | null) ?? null,
              }
            : null
        }
        pricesIncludeTax={pricesIncludeTax}
        isMember={isMember}
        freeShippingEnabled={checkoutSettings.freeShippingEnabled}
        freeShippingThreshold={checkoutSettings.freeShippingThreshold}
        brandSpecials={brandSpecials}
        upsell={
          showUpsell
            ? {
                planPrice,
                billingInterval,
              }
            : null
        }
      />
    </>
  );
}
