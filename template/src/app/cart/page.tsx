import { getCart } from "@/lib/actions/cart";
import { getSession } from "@/lib/auth";
import { getFeatureFlag, getSubscriptionPlans, getActiveSubscriptionForContact, getCheckoutSettings, getLadderConfig, getLiveSpecials, channelSettingsService, CHANNEL_ID } from "@/lib/store";
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

  const [subscriptionsEnabled, checkoutSettings, brandSpecials, ladder, liveSpecials] = await Promise.all([
    getFeatureFlag("subscriptions_enabled"),
    getCheckoutSettings(),
    // Brand free-shipping specials running today (card 88Ay7UGA). Handed to the
    // island rather than resolved here, because the island re-decides after every
    // quantity change and removal.
    activeBrandFreeShippingSpecials(),
    // The upsell's pitch names the spend ladder, so it reads whether this channel
    // actually runs one. Memoised settings read; DISABLED on a channel that has
    // never been given a ladder (card gk23c1VK).
    getLadderConfig().catch(() => null),
    // Which lines are on a running PARTNER SPECIAL (card tJ4audbu), so the summary prints that
    // saving on its own row and never credits it to a membership. Same cached read that priced
    // the line; a failed read just folds the gap back into the ordinary Discount row.
    getLiveSpecials(
      (items as { product_id: number | null }[])
        .map((i) => i.product_id)
        .filter((id): id is number => id != null)
    ).catch(() => new Map()),
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

  // Offers come off what the lines charge (card p6YVxc4P), so the GA4 value and
  // the summary both read the figure the checkout will actually bill.
  const offers = (cart as { offers?: { totalDiscount: number; messages: { kind: string; text: string }[] } } | null)?.offers ?? null;
  const total = Math.max(
    0,
    Math.round((parseFloat(cart?.cart_amount ?? "0") - (offers?.totalDiscount ?? 0)) * 100) / 100
  );

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
                coupon_codes: ((cart as { coupon_codes?: string[] | null }).coupon_codes ?? []) as string[],
                offers,
              }
            : null
        }
        pricesIncludeTax={pricesIncludeTax}
        isMember={isMember}
        freeShippingEnabled={checkoutSettings.freeShippingEnabled}
        freeShippingThreshold={checkoutSettings.freeShippingThreshold}
        brandSpecials={brandSpecials}
        specialProductIds={[...liveSpecials.keys()] as number[]}
        upsell={
          showUpsell
            ? {
                planPrice,
                billingInterval,
                ladderOn: Boolean(ladder?.enabled),
              }
            : null
        }
      />
    </>
  );
}
