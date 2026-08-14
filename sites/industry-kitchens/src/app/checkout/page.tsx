import Link from "next/link";
import { redirect } from "next/navigation";
import { Crown, ArrowRight } from "lucide-react";
import { getCart } from "@/lib/actions/cart";
import { getSession } from "@/lib/auth";
import { getFeatureFlag, getSubscriptionPlans, getActiveSubscriptionForContact, getCheckoutSettings, customerAddressService, contactService, channelSettingsService, shippingRateCardService, CHANNEL_ID } from "@/lib/store";
import { getContactPermissions } from "@/lib/role-permissions";
import { gstSplit } from "@keenan/services/calc";
import { resolveStripeGateway } from "@/lib/payments/gateway";
import { resolveNetTermsEntitlement } from "@/lib/checkout/net-terms";
import { ACCOUNT_REQUIRED_SETTING, checkoutNeedsSignIn } from "@/lib/checkout/account-required";
import { CheckoutSignInGate } from "@/components/checkout/CheckoutSignInGate";
import { lastOrderConfirmationPath } from "@/lib/checkout/last-order";
import { resolveAccountOptions } from "@/lib/checkout/account-options";
import {
  activeBrandFreeShippingSpecials,
  brandIdsForProducts,
} from "@/lib/checkout/free-shipping-brands";
import { matchBrandSpecial } from "@/lib/checkout/free-shipping-brands-policy";
import { filterPaymentMethodsForAccount } from "@/lib/checkout/account-options-policy";
import {
  filterFinanceMethods,
  financeLinesFromCart,
  financeOfferForCart,
  isFinancePaymentMethod,
} from "@/lib/checkout/finance";
import { financeApplicationForm } from "@/lib/checkout/finance-form";
import { CheckoutForm } from "@/components/checkout/CheckoutForm";
import { StartedCheckoutTracker } from "@/components/analytics/StartedCheckoutTracker";

export const metadata = {
  title: "Checkout",
};

export default async function CheckoutPage() {
  const cart = await getCart();

  if (!cart || cart.items.length === 0) {
    // Placing an order empties the cart, so coming back to /checkout (Back
    // button, bookmark, a second submit) used to dump the shopper on an EMPTY
    // CART. If they just ordered, send them to that order's confirmation.
    const justOrdered = await lastOrderConfirmationPath();
    redirect(justOrdered ?? "/cart");
  }

  const [session, checkoutSettings, requireAccount] = await Promise.all([
    getSession(),
    getCheckoutSettings(),
    getFeatureFlag(ACCOUNT_REQUIRED_SETTING),
  ]);

  // No guest checkout on this channel (Industry Kitchens, as on Zoey — card
  // LQM9FQYe): stop the shopper with the sign-in step instead of the form. The
  // cart is untouched, so signing in from here drops them straight back onto a
  // priced basket. placeOrder enforces the SAME rule server-side — this is only
  // what we show.
  if (checkoutNeedsSignIn(requireAccount, !!session)) {
    return (
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-zinc-900 mb-8">Checkout</h1>
        <CheckoutSignInGate />
      </div>
    );
  }

  // Net Terms is account-gated: only a logged-in customer whose email maps to an
  // active B2B account with net_terms_days > 0 may defer payment. Everyone else
  // (guests, customers with no net-terms account) pays upfront — card or bank
  // transfer (invoice → pay → deliver). When eligible, show the account's actual
  // term length, not the flat channel default. Uses the SAME entitlement resolver
  // placeOrder authorizes against, so what we show is exactly what we'll accept.
  //
  // Account Options (L3) narrow the list further: an account may carry an explicit
  // payment-method allow-list (NULL/empty = every channel method). Same resolver
  // placeOrder authorizes against — every filter here IS duplicated there, or the
  // storefront would leak a bypass.
  const [netTerms, accountOptions] = await Promise.all([
    resolveNetTermsEntitlement(session),
    resolveAccountOptions(session),
  ]);
  // customerPaymentMethods, never paymentMethods and never enabledPaymentMethods:
  // the shared read returns EVERY configured method (the admin editor and
  // past-order lookups need the disabled ones), and the "enabled" list still
  // contains channel STAFF-ONLY methods — Zoey keeps Send Invoice to staff, and
  // IK has it switched on today. A customer surface reads the customer list
  // (services `customerFacingPaymentMethods`, card NmAfwrdE); placeOrder
  // authorises against the same list.
  const entitledPaymentMethods = filterPaymentMethodsForAccount(
    checkoutSettings.customerPaymentMethods,
    accountOptions?.allowedPaymentMethods ?? null
  )
    .filter((m) => m.id !== "net_terms" || !!netTerms)
    .map((m) => (m.id === "net_terms" && netTerms ? { ...m, netTermsDays: netTerms.netTermsDays } : m));

  const subtotal = parseFloat(cart.cart_amount ?? "0");

  // Brand free-shipping special (card 88Ay7UGA): any line from a promoted brand
  // makes the whole order's delivery free, for everyone, with no minimum spend.
  // `placeOrder` resolves this again from the same rows before charging.
  const brandSpecials = await activeBrandFreeShippingSpecials();
  const brandSpecial = brandSpecials.length
    ? matchBrandSpecial(
        brandSpecials,
        [
          ...(
            await brandIdsForProducts(
              (cart.items as { product_id: number }[]).map((i) => i.product_id)
            )
          ).values(),
        ]
      )
    : null;

  // Check tax mode
  let pricesIncludeTax = false;
  try {
    const taxSetting = await channelSettingsService.getByKey(CHANNEL_ID, "prices_include_tax");
    pricesIncludeTax = taxSetting.setting_value === true || taxSetting.setting_value === "true";
  } catch {}
  // GST display amount via gstSplit (single source of tax math — services D4).
  const gstAmount = Math.round(gstSplit(subtotal, pricesIncludeTax).tax * 100) / 100;

  // ── SilverChef / Finance (card VAjaPj0t) ──────────────────────────────────
  // Offered only above $1,000 inc GST, measured on the GOODS total so the offer
  // can't appear and disappear as a postcode changes the freight. placeOrder
  // re-resolves this with the SAME function before accepting the order — show
  // equals accept. Nothing here is drawn when no finance method is enabled on
  // the channel, so a storefront that doesn't offer finance pays nothing for it.
  const financeMethodsEnabled = entitledPaymentMethods.some((m) => isFinancePaymentMethod(m.id));
  const financeOffer = financeMethodsEnabled
    ? financeOfferForCart({
        lines: financeLinesFromCart(cart.items as never[], pricesIncludeTax),
        goodsTotalIncGst: gstSplit(subtotal, pricesIncludeTax).incTax,
      })
    : null;
  const paymentMethods = filterFinanceMethods(entitledPaymentMethods, !!financeOffer?.eligible);
  // The application form has to exist before its attachment uploads can be
  // accepted, and it is a shared definition rather than hand-made data — so it
  // is provisioned on first use. Never fatal: a checkout must not fail because
  // a form row couldn't be written.
  if (financeOffer?.eligible) {
    // Cached for a minute and shared with placeOrder — checkout is the critical
    // path and this row changes only when staff edit the form. Never throws.
    await financeApplicationForm();
  }

  // Load saved addresses for the logged-in contact (identity unification —
  // listForContact also covers legacy customer-keyed rows via the migration's
  // contact_id backfill).
  let savedAddresses: { id: number; firstName: string; lastName: string; address1: string; address2?: string; city: string; stateOrProvince: string; postalCode: string; countryCode: string; phone?: string | null; isDefaultBilling: boolean }[] = [];
  if (session) {
    try {
      const rows = await customerAddressService.listForContact(session.contactId);
      savedAddresses = rows.slice(0, 20).map((a: Record<string, unknown>) => ({
        id: a.id as number,
        firstName: (a.first_name || a.firstName || "") as string,
        lastName: (a.last_name || a.lastName || "") as string,
        address1: (a.address1 || "") as string,
        address2: (a.address2 || "") as string,
        city: (a.city || "") as string,
        stateOrProvince: (a.state_or_province || a.stateOrProvince || "") as string,
        postalCode: (a.postal_code || a.postalCode || "") as string,
        countryCode: (a.country_code || a.countryCode || "AU") as string,
        // Was never mapped, so selecting a saved address posted an EMPTY phone
        // even though CheckoutForm submits it as a hidden field.
        phone: (a.phone ?? null) as string | null,
        isDefaultBilling: !!(a.is_default_billing ?? a.isDefaultBilling),
      }));
    } catch {
      // No saved addresses
    }
  }

  // Prefill the contact panel for a signed-in shopper who has NO saved address —
  // their name and phone live on the contact record, not in the address book, so
  // without this they retype details we already hold. Best-effort: a failed
  // lookup just leaves the fields blank. Nothing here is written back — editing
  // these fields affects this order only.
  let contactPrefill: { firstName: string; lastName: string; phone: string } | undefined;
  if (session) {
    const contact = (await contactService
      .getById(session.contactId)
      .catch(() => null)) as { first_name?: string | null; last_name?: string | null; phone?: string | null } | null;
    if (contact) {
      contactPrefill = {
        firstName: contact.first_name ?? "",
        lastName: contact.last_name ?? "",
        phone: contact.phone ?? "",
      };
    }
  }

  // May this shopper add the address they type to their address book? Guests have
  // no account to save into. A contact on a B2B account is bound by the SAME role
  // codes placeOrder enforces for a new checkout address — if their role forbids
  // adding one, we must not offer to keep it. placeOrder re-checks this server-side;
  // this is only what we SHOW.
  let canSaveNewAddress = false;
  if (session) {
    const perms = await getContactPermissions(session.contactId);
    canSaveNewAddress =
      !perms.isB2B ||
      perms.accountId === null ||
      (perms.can("add_billing_address_in_checkout") && perms.can("add_shipping_address_in_checkout"));
  }

  // Resolve the channel's Stripe gateway (test-vs-live aware, prod-safe fallback)
  // from the global payment_gateways setting. All channels share one Stripe
  // account; segmentation happens via metadata.
  //
  // `testSession` is true ONLY while this browser holds an ephemeral test checkout
  // session (a short-lived signed cookie; nothing stored anywhere, no setting a
  // human can leave switched on). It is the sole input to the on-screen "test
  // mode, no money will be taken" banner, so the banner cannot be rendered
  // without one.
  const { gateway: stripeGateway, testSession } = await resolveStripeGateway();
  const stripePublishableKey: string | undefined = stripeGateway?.credentials?.publishable_key;

  // A test checkout session that cannot resolve a TEST gateway must refuse to take
  // payment, never fall back to live: this browser was told no money would be
  // taken. Drop the card option entirely rather than mounting Elements on a live
  // key or leaving a Pay button that would charge a real card.
  const cardUnavailableInTestSession = testSession && !stripePublishableKey;
  const offeredPaymentMethods = cardUnavailableInTestSession
    ? paymentMethods.filter((m) => m.id !== "stripe")
    : paymentMethods;

  // Check if shipping rate calculation is available
  let shippingEnabled = false;
  try {
    const activeCard = await shippingRateCardService.getActiveForChannel(CHANNEL_ID);
    shippingEnabled = !!activeCard;
  } catch {}

  // Check membership status for checkout banners
  let showMemberBanner = false;
  let estimatedSavings = 0;
  let isMember = false;
  let memberSavings = 0;

  const subscriptionsEnabled = await getFeatureFlag("subscriptions_enabled");
  if (subscriptionsEnabled) {
    if (session) {
      const activeSub = await getActiveSubscriptionForContact(session.contactId);
      isMember = !!activeSub;
    }
    if (isMember) {
      // Member savings flow through item salePrice (cart.discountAmount stays
      // 0): the saving is full list value minus what's actually charged.
      const listValue = (cart.items as { list_price: string | null; quantity: number }[]).reduce(
        (sum, i) => sum + (i.list_price ? parseFloat(i.list_price) : 0) * i.quantity,
        0
      );
      memberSavings = Math.max(0, Math.round((listValue - subtotal) * 100) / 100);
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
      <StartedCheckoutTracker
        value={subtotal}
        itemNames={(cart.items as Array<Record<string, unknown>>).map((i) => String(i.product_name ?? i.name ?? ""))}
        items={cart.items as Array<Record<string, unknown>>}
      />
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
        isSignedIn={!!session}
        contactPrefill={contactPrefill}
        canSaveNewAddress={canSaveNewAddress}
        countries={checkoutSettings.supportedCountries}
        paymentMethods={offeredPaymentMethods}
        savedAddresses={savedAddresses}
        googlePlacesEnabled={checkoutSettings.googlePlacesEnabled}
        freeShippingEnabled={checkoutSettings.freeShippingEnabled}
        freeShippingThreshold={checkoutSettings.freeShippingThreshold}
        brandSpecial={brandSpecial}
        shippingEnabled={shippingEnabled}
        stripePublishableKey={stripePublishableKey}
        testMode={testSession}
        testModeCardUnavailable={cardUnavailableInTestSession}
        finance={financeOffer}
      />
    </div>
  );
}
