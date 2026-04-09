import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { getCart } from "@/lib/actions/cart";
import { getSession } from "@/lib/auth";
import { getFeatureFlag, getSubscriptionPlans, getActiveSubscription, getCheckoutSettings, channelSettingsService, CHANNEL_ID } from "@/lib/store";
import { CartItemsList } from "@/components/cart/CartItemsList";
import { CartSummary } from "@/components/cart/CartSummary";
import { MembershipCartUpsell } from "@/components/cart/MembershipCartUpsell";

export const metadata = {
  title: "Cart",
};

export default async function CartPage() {
  const cart = await getCart();
  const items = cart?.items ?? [];

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-zinc-900 mb-8">Your Cart</h1>
        <div className="text-center py-16">
          <ShoppingCart className="h-16 w-16 text-zinc-300 mx-auto" />
          <p className="mt-4 text-zinc-500">Your cart is empty.</p>
          <Link
            href="/products"
            className="mt-6 inline-block bg-zinc-900 text-white px-6 py-3 rounded-lg font-semibold hover:bg-zinc-800 transition-colors"
          >
            Continue Shopping
          </Link>
        </div>
      </div>
    );
  }

  const subtotal = parseFloat(cart!.baseAmount ?? "0");
  const discount = parseFloat(cart!.discountAmount ?? "0");
  const total = parseFloat(cart!.cartAmount ?? "0");

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
  let savingsPercentage = 15;

  const [subscriptionsEnabled, checkoutSettings] = await Promise.all([
    getFeatureFlag("subscriptions_enabled"),
    getCheckoutSettings(),
  ]);
  savingsPercentage = checkoutSettings.memberSavingsPercentage;
  if (subscriptionsEnabled) {
    const session = await getSession();
    if (session) {
      const activeSub = await getActiveSubscription(session.customerId);
      isMember = !!activeSub;
    }
    if (!isMember) {
      const plans = await getSubscriptionPlans();
      if (plans.length > 0) {
        showUpsell = true;
        planPrice = parseFloat(plans[0].price);
        billingInterval = plans[0].billingInterval;
      }
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-zinc-900 mb-8">Your Cart</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <CartItemsList items={items} />
        </div>
        <div className="space-y-4">
          <CartSummary subtotal={subtotal} discount={discount} total={total} isMember={isMember} pricesIncludeTax={pricesIncludeTax} />
          {showUpsell && (
            <MembershipCartUpsell
              cartTotal={total}
              planPrice={planPrice}
              billingInterval={billingInterval}
              savingsPercentage={savingsPercentage}
            />
          )}
        </div>
      </div>
    </div>
  );
}
