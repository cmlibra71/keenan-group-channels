import Link from "next/link";
import { redirect } from "next/navigation";
import { Crown, ArrowRight } from "lucide-react";
import { getCart } from "@/lib/actions/cart";
import { getSession } from "@/lib/auth";
import { getFeatureFlag, getSubscriptionPlans, getActiveSubscription, getCheckoutSettings, customerAddressService, channelSettingsService, CHANNEL_ID } from "@/lib/store";
import { CheckoutForm } from "@/components/checkout/CheckoutForm";

export const metadata = {
  title: "Checkout",
};

export default async function CheckoutPage() {
  const cart = await getCart();

  if (!cart || cart.items.length === 0) {
    redirect("/cart");
  }

  const [session, checkoutSettings] = await Promise.all([
    getSession(),
    getCheckoutSettings(),
  ]);

  const subtotal = parseFloat(cart.cartAmount ?? "0");

  // Check tax mode
  let pricesIncludeTax = false;
  try {
    const taxSetting = await channelSettingsService.getByKey(CHANNEL_ID, "prices_include_tax");
    pricesIncludeTax = taxSetting.setting_value === true || taxSetting.setting_value === "true";
  } catch {}
  const gstAmount = pricesIncludeTax
    ? Math.round((subtotal / 1.1 * 0.1) * 100) / 100
    : Math.round(subtotal * 0.1 * 100) / 100;

  // Load saved addresses for logged-in customers
  let savedAddresses: { id: number; firstName: string; lastName: string; address1: string; address2?: string; city: string; stateOrProvince: string; postalCode: string; countryCode: string; isDefaultBilling: boolean }[] = [];
  if (session) {
    try {
      const result = await customerAddressService.listForParent(session.customerId, {
        page: 1,
        limit: 20,
        sort: "id",
        direction: "desc",
      });
      savedAddresses = result.data.map((a: Record<string, unknown>) => ({
        id: a.id as number,
        firstName: (a.first_name || a.firstName || "") as string,
        lastName: (a.last_name || a.lastName || "") as string,
        address1: (a.address1 || "") as string,
        address2: (a.address2 || "") as string,
        city: (a.city || "") as string,
        stateOrProvince: (a.state_or_province || a.stateOrProvince || "") as string,
        postalCode: (a.postal_code || a.postalCode || "") as string,
        countryCode: (a.country_code || a.countryCode || "AU") as string,
        isDefaultBilling: !!(a.is_default_billing ?? a.isDefaultBilling),
      }));
    } catch {
      // No saved addresses
    }
  }

  // Check membership status for checkout banners
  let showMemberBanner = false;
  let estimatedSavings = 0;
  let isMember = false;
  let memberSavings = 0;

  const subscriptionsEnabled = await getFeatureFlag("subscriptions_enabled");
  if (subscriptionsEnabled) {
    if (session) {
      const activeSub = await getActiveSubscription(session.customerId);
      isMember = !!activeSub;
    }
    if (isMember) {
      memberSavings = parseFloat(cart.discountAmount ?? "0");
    } else {
      const plans = await getSubscriptionPlans();
      if (plans.length > 0) {
        showMemberBanner = true;
        estimatedSavings = Math.round(subtotal * (checkoutSettings.memberSavingsPercentage / 100) * 100) / 100;
      }
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-zinc-900 mb-8">Checkout</h1>

      {isMember && memberSavings > 0 && (
        <div className="mb-6 flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
          <Crown className="h-4 w-4 text-green-600 shrink-0" />
          <span className="text-sm text-green-800">
            You&apos;re saving ${memberSavings.toFixed(2)} with your membership on this order
          </span>
        </div>
      )}

      {showMemberBanner && estimatedSavings > 0 && (
        <div className="mb-6 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-amber-800">
            <Crown className="h-4 w-4 text-amber-600 shrink-0" />
            Members save up to ${estimatedSavings.toFixed(2)} on this order.
          </div>
          <Link
            href="/membership"
            className="inline-flex items-center gap-1 text-sm font-semibold text-amber-700 hover:text-amber-800 shrink-0"
          >
            Join now
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}

      <CheckoutForm
        items={cart.items}
        subtotal={subtotal}
        gstAmount={gstAmount}
        isMember={isMember}
        pricesIncludeTax={pricesIncludeTax}
        customerEmail={session?.email}
        countries={checkoutSettings.supportedCountries}
        paymentMethods={checkoutSettings.paymentMethods}
        savedAddresses={savedAddresses}
        googlePlacesEnabled={checkoutSettings.googlePlacesEnabled}
        freeShippingEnabled={checkoutSettings.freeShippingEnabled}
        freeShippingThreshold={checkoutSettings.freeShippingThreshold}
      />
    </div>
  );
}
