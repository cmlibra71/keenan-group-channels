import Link from "next/link";
import { redirect } from "next/navigation";
import { Crown, ArrowRight } from "lucide-react";
import { getCart } from "@/lib/actions/cart";
import { getSession } from "@/lib/auth";
import { getFeatureFlag, getSubscriptionPlans, getActiveSubscription } from "@/lib/store";
import { CheckoutForm } from "@/components/checkout/CheckoutForm";

export const metadata = {
  title: "Checkout",
};

export default async function CheckoutPage() {
  const cart = await getCart();

  if (!cart || cart.items.length === 0) {
    redirect("/cart");
  }

  const session = await getSession();
  const subtotal = parseFloat(cart.cartAmount ?? "0");

  // Check if non-member should see banner
  let showMemberBanner = false;
  let estimatedSavings = 0;

  const subscriptionsEnabled = await getFeatureFlag("subscriptions_enabled");
  if (subscriptionsEnabled) {
    let isMember = false;
    if (session) {
      const activeSub = await getActiveSubscription(session.customerId);
      isMember = !!activeSub;
    }
    if (!isMember) {
      const plans = await getSubscriptionPlans();
      if (plans.length > 0) {
        showMemberBanner = true;
        estimatedSavings = Math.round(subtotal * 0.15 * 100) / 100;
      }
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 lg:px-8 section-padding">
      <p className="eyebrow mb-3">ORDER</p>
      <h1 className="text-3xl heading-serif text-text-primary mb-8">Checkout</h1>

      {showMemberBanner && estimatedSavings > 0 && (
        <div className="mb-6 flex items-center justify-between bg-surface-primary border border-border px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-text-body">
            <Crown className="h-4 w-4 text-accent shrink-0" />
            Members save ~${estimatedSavings.toFixed(2)} on this order.
          </div>
          <Link
            href="/membership"
            className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:text-accent-dark shrink-0 transition-colors duration-300"
          >
            Join now
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}

      <CheckoutForm
        items={cart.items}
        subtotal={subtotal}
        customerEmail={session?.email}
      />
    </div>
  );
}
