"use client";

import { useActionState, useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { placeOrder, confirmStripePayment } from "@/lib/actions/checkout";
import { qualifiesForFreeDelivery } from "@/lib/checkout/shipping";
import {
  AU_STATES,
  normaliseAuState,
  isValidAuPostcode,
  auAddressNeedsCorrection,
} from "@/lib/checkout/au-address";
import { Price } from "@/components/ui/Price";
import { AddressAutocomplete } from "@/components/checkout/AddressAutocomplete";
import { emailHasAccount } from "@/lib/actions/account-panel";
import { decideEmailProbe, normaliseEmail } from "@/lib/checkout/account-prompt";
import {
  PAY_UNAVAILABLE_ACCOUNT_ORDER,
  type PaymentAvailability,
} from "@/lib/checkout/payment-availability";
import { useHeaderPanels } from "@/lib/cart-quote-counts";
import { ga4AddShippingInfo, ga4AddPaymentInfo, rowToGa4Item } from "@/components/analytics/ga4";
import { BulkyDeliveryChoice } from "@/components/checkout/BulkyDeliveryChoice";
import { holdsPayment, type DeliveryService } from "@/lib/checkout/bulky-delivery";

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Stripe?: (key: string) => any;
  }
}

function loadStripeScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Stripe) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://js.stripe.com/v3/";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Stripe.js"));
    document.head.appendChild(script);
  });
}

type CartItem = {
  product_name: string;
  quantity: number;
  list_price: string;
  sale_price: string | null;
  // Present on the runtime cart rows (getWithItems) — used for GA4 item ids.
  product_id?: number;
  product_sku?: string | null;
  variant_sku?: string | null;
};

type Country = {
  code: string;
  name: string;
};

type BankDetails = {
  bankName: string;
  accountName: string;
  bsb: string;
  accountNumber: string;
  reference?: string;
};

type PaymentMethod = {
  id: string;
  name: string;
  description: string;
  bankDetails?: BankDetails;
  netTermsDays?: number;
};

type SavedAddress = {
  id: number;
  firstName: string;
  lastName: string;
  address1: string;
  address2?: string;
  city: string;
  stateOrProvince: string;
  postalCode: string;
  countryCode: string;
  phone?: string | null;
  isDefaultBilling: boolean;
};

export function CheckoutForm({
  items,
  subtotal,
  gstAmount,
  isMember,
  pricesIncludeTax,
  customerEmail,
  isSignedIn = false,
  contactPrefill,
  canSaveNewAddress = false,
  countries = [],
  paymentMethods = [],
  paymentAvailability = "available",
  savedAddresses = [],
  googlePlacesEnabled = false,
  freeShippingEnabled = false,
  freeShippingThreshold = 500,
  shippingEnabled = false,
  bulkyProductNames = [],
  stripePublishableKey,
  testMode = false,
}: {
  items: CartItem[];
  subtotal: number;
  gstAmount: number;
  isMember?: boolean;
  pricesIncludeTax?: boolean;
  customerEmail?: string;
  /** Is there a session? Guests are offered the sign-in / create-account drawer,
   *  and only their typed email is checked against existing accounts. */
  isSignedIn?: boolean;
  /** Name + phone off the signed-in shopper's contact record, so a first-time
   *  buyer with no saved address doesn't retype what we already hold. */
  contactPrefill?: { firstName: string; lastName: string; phone: string };
  /** Whether to offer "Save this address for next time" — false for guests and
   *  for a B2B contact whose role forbids adding an address at checkout. */
  canSaveNewAddress?: boolean;
  countries?: Country[];
  paymentMethods?: PaymentMethod[];
  /** Why the list above may be empty — the store has none switched on, or this
   *  account may use none of them. Resolved on the server; placeOrder refuses the
   *  account-restricted case exactly as this form blocks it (card N8kE8arY). */
  paymentAvailability?: PaymentAvailability;
  savedAddresses?: SavedAddress[];
  googlePlacesEnabled?: boolean;
  freeShippingEnabled?: boolean;
  freeShippingThreshold?: number;
  shippingEnabled?: boolean;
  /** Names of the cart's bulky products (card Wxjp8wpg). Non-empty ⇒ the shopper must choose
   *  curbside vs specialised delivery before this order can be placed. */
  bulkyProductNames?: string[];
  stripePublishableKey?: string;
  testMode?: boolean;
}) {
  const router = useRouter();
  const { open: openPanel } = useHeaderPanels();
  const [state, formAction, isPending] = useActionState(placeOrder, null);
  const [selectedAddressId, setSelectedAddressId] = useState<number | "new">(
    () => savedAddresses.find((a) => a.isDefaultBilling)?.id ?? "new"
  );
  // The order email. Controlled so that signing in mid-checkout can put the
  // account's address in the field — it stays editable, this order can still be
  // sent to a different address.
  const [email, setEmail] = useState(customerEmail ?? "");
  // "You already have an account" — shown when the address they typed as a guest
  // matches one, offering the same drawer rather than a silent guest order.
  const [existingAccount, setExistingAccount] = useState(false);
  // Answers we already have, per address — see decideEmailProbe.
  const probed = useRef<Map<string, boolean>>(new Map());
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>(
    () => paymentMethods[0]?.id ?? ""
  );
  // Bulky-item delivery choice (card Wxjp8wpg). Deliberately starts UNSET even though there are
  // only two options: the 27-Jul decision is that the shopper is made to choose, and defaulting
  // to curbside would quietly sell a tail-lift job as a kerbside drop.
  const [deliveryService, setDeliveryService] = useState<DeliveryService | "">("");
  const hasBulkyItems = bulkyProductNames.length > 0;
  // Specialised delivery is quoted by a human afterwards, so the order is HELD: no card is
  // charged, no rate-card freight is added, and the payment step is replaced by an explanation.
  const heldForSpecialised = hasBulkyItems && holdsPayment(deliveryService);
  const [stripeError, setStripeError] = useState<string | null>(null);
  const [stripeProcessing, setStripeProcessing] = useState(false);
  const [cardReady, setCardReady] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stripeRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cardElementRef = useRef<any>(null);
  const cardContainerRef = useRef<HTMLDivElement>(null);

  // Initialize Stripe when the stripe payment method is selected
  useEffect(() => {
    if (selectedPaymentMethod !== "stripe" || !stripePublishableKey) return;

    let mounted = true;

    async function initStripe() {
      try {
        await loadStripeScript();
        if (!mounted || !window.Stripe) return;

        const stripe = window.Stripe(stripePublishableKey!);
        stripeRef.current = stripe;

        const elements = stripe.elements();
        const card = elements.create("card", {
          // The billing-address form already collects the postal code, so hide
          // Stripe's redundant in-widget postal field (avoids double entry and a
          // second place the customer can leave incomplete).
          hidePostalCode: true,
          style: {
            base: {
              fontSize: "16px",
              color: "#18181b",
              fontFamily: "system-ui, -apple-system, sans-serif",
              "::placeholder": { color: "#a1a1aa" },
            },
            invalid: { color: "#dc2626" },
          },
        });

        if (cardContainerRef.current) {
          card.mount(cardContainerRef.current);
          cardElementRef.current = card;

          card.on("ready", () => {
            if (mounted) setCardReady(true);
          });

          card.on("change", (event: { error?: { message: string } }) => {
            if (mounted) setStripeError(event.error ? event.error.message : null);
          });
        }
      } catch {
        if (mounted) setStripeError("Failed to load payment form");
      }
    }

    initStripe();

    return () => {
      mounted = false;
      cardElementRef.current?.destroy();
      cardElementRef.current = null;
      setCardReady(false);
    };
  }, [selectedPaymentMethod, stripePublishableKey]);

  // Handle Stripe payment response from server action
  useEffect(() => {
    if (!state?.stripe || stripeProcessing) return;

    const { clientSecret, orderNumber } = state.stripe;

    async function confirmPayment() {
      if (!stripeRef.current || !cardElementRef.current) return;

      setStripeProcessing(true);
      setStripeError(null);

      try {
        const { error: stripeErr } = await stripeRef.current.confirmCardPayment(
          clientSecret,
          { payment_method: { card: cardElementRef.current } }
        );

        if (stripeErr) {
          setStripeError(stripeErr.message || "Payment failed");
          setStripeProcessing(false);
          return;
        }

        // Optimistic server-side status update; portal webhook is the source of truth.
        await confirmStripePayment(orderNumber);

        // Redirect to confirmation
        router.push(`/checkout/confirmation?order=${orderNumber}&pm=stripe`);
      } catch (err) {
        setStripeError(err instanceof Error ? err.message : "Payment failed");
        setStripeProcessing(false);
      }
    }

    confirmPayment();
  }, [state?.stripe, stripeProcessing, router]);

  // Refs for address autocomplete
  const address1Ref = useRef<HTMLInputElement>(null);
  const cityRef = useRef<HTMLInputElement>(null);

  // Country / state / postcode are controlled: the State field is a fixed
  // dropdown for Australia (free text elsewhere) and the postcode is restricted
  // to 4 digits for Australia, so both need a value we own rather than a ref.
  const [country, setCountry] = useState<string>(() => countries[0]?.code || "AU");
  const [stateValue, setStateValue] = useState("");
  const [postalCodeValue, setPostalCodeValue] = useState("");
  const isAu = country === "AU";

  // Shipping calculation state
  const [shippingCost, setShippingCost] = useState<number | null>(null);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [shippingError, setShippingError] = useState<string | null>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  const freeDelivery = qualifiesForFreeDelivery({
    enabled: !!freeShippingEnabled,
    isMember: !!isMember,
    amount: subtotal,
    threshold: freeShippingThreshold,
  });

  const calculateShippingCost = useCallback(
    async (postcode: string) => {
      if (!shippingEnabled || !postcode || postcode.length < 3) {
        setShippingCost(null);
        setShippingError(null);
        return;
      }

      // Don't calculate if free shipping applies
      if (freeDelivery) {
        setShippingCost(0);
        return;
      }

      setShippingLoading(true);
      setShippingError(null);

      try {
        const response = await fetch("/api/shipping/calculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ postcode, subtotal }),
        });
        const result = await response.json();

        if (result.success) {
          setShippingCost(result.cost);
          setShippingError(null);
        } else {
          setShippingCost(null);
          setShippingError(result.error || "Could not calculate shipping");
        }
      } catch {
        setShippingError("Failed to calculate shipping");
        setShippingCost(null);
      } finally {
        setShippingLoading(false);
      }
    },
    [shippingEnabled, freeDelivery, subtotal]
  );

  const handlePostcodeChange = useCallback(
    (postcode: string) => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        calculateShippingCost(postcode);
      }, 600);
    },
    [calculateShippingCost]
  );

  const handlePlaceSelect = useCallback(
    (place: { address1: string; city: string; state: string; postalCode: string; countryCode: string }) => {
      if (address1Ref.current) address1Ref.current.value = place.address1;
      if (cityRef.current) cityRef.current.value = place.city;
      // Places returns "VIC" or "Victoria" — normalise so the dropdown matches.
      setStateValue(normaliseAuState(place.state) ?? place.state);
      setPostalCodeValue(place.postalCode);
      if (place.countryCode) setCountry(place.countryCode);
      // Trigger shipping calculation when address is autocompleted
      if (place.postalCode) {
        calculateShippingCost(place.postalCode);
      }
    },
    [calculateShippingCost]
  );

  const selectedAddress = savedAddresses.find((a) => a.id === selectedAddressId);

  // A saved address written before the AU rules existed can carry a free-text
  // state ("North Eastern Australia") or a junk postcode. The server now refuses
  // those, so simply passing them through would strand the shopper on an error
  // they have no way to clear from this page. Open the editable form pre-filled
  // instead, so they can correct it for this order.
  const needsCorrection = !!selectedAddress && auAddressNeedsCorrection(selectedAddress);
  const showAddressForm =
    savedAddresses.length === 0 || selectedAddressId === "new" || needsCorrection;
  const prefill = needsCorrection ? selectedAddress : undefined;

  // On the EMPTY new-address form (not the correction path, which is seeded from
  // the saved address instead) fall back to the contact's own name and phone.
  const seed = needsCorrection
    ? { firstName: prefill?.firstName ?? "", lastName: prefill?.lastName ?? "", phone: prefill?.phone ?? "" }
    : {
        firstName: contactPrefill?.firstName ?? "",
        lastName: contactPrefill?.lastName ?? "",
        phone: contactPrefill?.phone ?? "",
      };

  // Seed the correction form from the saved address — once per address, so a
  // re-render never wipes what the shopper has typed.
  const prefilledFor = useRef<number | null>(null);
  useEffect(() => {
    if (!prefill || prefilledFor.current === prefill.id) return;
    prefilledFor.current = prefill.id;
    setCountry(prefill.countryCode || "AU");
    setStateValue(normaliseAuState(prefill.stateOrProvince) ?? "");
    const postcode = isValidAuPostcode(prefill.postalCode) ? prefill.postalCode.trim() : "";
    setPostalCodeValue(postcode);
    // Only the state was wrong — price the (valid) postcode straight away.
    if (postcode) calculateShippingCost(postcode);
  }, [prefill, calculateShippingCost]);

  // Recalculate shipping when a saved address is selected. Skipped while
  // correcting: the saved postcode is the unusable one, and the form's own
  // onChange prices whatever the shopper types instead.
  useEffect(() => {
    if (selectedAddress && !needsCorrection && shippingEnabled) {
      calculateShippingCost(selectedAddress.postalCode);
    }
  }, [
    selectedAddressId,
    selectedAddress,
    needsCorrection,
    shippingEnabled,
    calculateShippingCost,
  ]);

  // ── Signing in from here ───────────────────────────────────────────────────
  // The drawer's sign-in re-renders this page with a session, so these two
  // effects are what "revert to the order and populate the information" means in
  // practice: the account's email becomes the order email, and the addresses we
  // hold are offered instead of the blank form they were looking at.
  useEffect(() => {
    if (!customerEmail) return;
    setEmail(customerEmail);
  }, [customerEmail]);

  // Keyed on WHICH addresses arrived, not on the array identity: a plain
  // re-render must never drag the shopper back off "Enter a new address".
  const savedAddressKey = savedAddresses.map((a) => a.id).join(",");
  useEffect(() => {
    const preferred = savedAddresses.find((a) => a.isDefaultBilling)?.id;
    if (preferred !== undefined) setSelectedAddressId(preferred);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedAddressKey]);

  // Does the typed address already have an account? Debounced, asked once per
  // address, never for a shopper who is already signed in (see decideEmailProbe).
  useEffect(() => {
    const decision = decideEmailProbe({ email, isSignedIn, known: probed.current });
    if (decision.action === "skip") {
      setExistingAccount(false);
      return;
    }
    if (decision.action === "known") {
      setExistingAccount(decision.hasAccount);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const found = await emailHasAccount(decision.email);
        probed.current.set(decision.email, found);
        if (!cancelled) setExistingAccount(found);
      } catch {
        // A hint is never worth an error at checkout.
      }
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [email, isSignedIn]);

  function openAccountPanel(view: "login" | "register") {
    // returnTo "close" drops the drawer once they're in, leaving them on this
    // page — which has re-rendered with their session, prices and addresses.
    openPanel("account", { view, email: normaliseEmail(email) || undefined, returnTo: "close" });
  }

  // ── GA4 funnel (single-page checkout) ──────────────────────────────────────
  // add_shipping_info fires once when the shipping cost resolves;
  // add_payment_info when a payment method is chosen (once per method).
  // Both also fire on submit as a fallback so the defaults are still captured.
  const shippingInfoFired = useRef(false);
  const paymentInfoFired = useRef<string | null>(null);

  const fireShippingInfo = useCallback(
    (cost: number | null) => {
      if (shippingInfoFired.current) return;
      shippingInfoFired.current = true;
      const free = cost === 0 || freeDelivery;
      ga4AddShippingInfo(
        items.map((it, i) => rowToGa4Item(it as unknown as Record<string, unknown>, i)),
        subtotal,
        free ? "Free Delivery" : "Standard Delivery"
      );
    },
    [items, subtotal, freeDelivery]
  );

  const firePaymentInfo = useCallback(
    (methodId: string) => {
      if (!methodId || paymentInfoFired.current === methodId) return;
      paymentInfoFired.current = methodId;
      ga4AddPaymentInfo(
        items.map((it, i) => rowToGa4Item(it as unknown as Record<string, unknown>, i)),
        subtotal,
        methodId
      );
    },
    [items, subtotal]
  );

  useEffect(() => {
    if (shippingCost !== null) fireShippingInfo(shippingCost);
  }, [shippingCost, fireShippingInfo]);

  // The order must never be submitted with an unpriced delivery: a postcode we
  // can't match to a zone used to show an error in the summary while the button
  // stayed live, and the order was written with $0 freight. Block instead.
  const shippingUnresolved =
    !heldForSpecialised &&
    shippingEnabled &&
    !freeDelivery &&
    (shippingLoading || shippingCost === null);

  // Every payment method this store offers is off-limits to this account (per-method
  // "Staff only", or the account's allow-list). That is a sales-desk instruction, not
  // a misconfiguration: refuse the order and tell the customer who to call, rather
  // than book an unpaid order they believe is paid. Zoey blocks here too, and the
  // pay-a-quote screen already greys its Pay button for the same account state.
  // Note this is NOT the "store has nothing switched on" case, which still places the
  // order with payment status "pending" (payment-methods register entry).
  const paymentUnavailable = paymentAvailability === "account-restricted";

  return (
    <form
      action={formAction}
      onSubmit={() => {
        fireShippingInfo(shippingCost);
        firePaymentInfo(selectedPaymentMethod);
      }}
    >
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        <div className="lg:col-span-3 space-y-6">
          {/* Contact */}
          <div className="border border-zinc-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-zinc-900 mb-4">Contact</h2>
            {!isSignedIn && (
              <p className="mb-4 text-sm text-zinc-500">
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => openAccountPanel("login")}
                  className="font-medium text-zinc-900 underline hover:no-underline"
                >
                  Sign in
                </button>{" "}
                to use your saved details and your account pricing, or{" "}
                <button
                  type="button"
                  onClick={() => openAccountPanel("register")}
                  className="font-medium text-zinc-900 underline hover:no-underline"
                >
                  create an account
                </button>
                .
              </p>
            )}
            <div>
              <label className="block text-sm font-medium text-zinc-700">Email</label>
              <input
                type="email"
                name="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                placeholder="your@email.com"
              />
              {existingAccount && !isSignedIn && (
                <p className="mt-2 rounded-lg bg-zinc-50 border border-zinc-200 px-3 py-2 text-sm text-zinc-700">
                  You already have an account with this email.{" "}
                  <button
                    type="button"
                    onClick={() => openAccountPanel("login")}
                    className="font-medium text-zinc-900 underline hover:no-underline"
                  >
                    Sign in
                  </button>{" "}
                  to use your saved details and your account pricing.
                </p>
              )}
            </div>
          </div>

          {/* Billing Address */}
          <div className="border border-zinc-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-zinc-900 mb-4">Billing Address</h2>

            {/* Saved address selector */}
            {savedAddresses.length > 0 && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-zinc-700 mb-2">
                  Select an address
                </label>
                <div className="space-y-2">
                  {savedAddresses.map((addr) => (
                    <label
                      key={addr.id}
                      className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedAddressId === addr.id
                          ? "border-zinc-900 bg-zinc-50"
                          : "border-zinc-200 hover:border-zinc-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="selectedAddressId"
                        value={addr.id}
                        checked={selectedAddressId === addr.id}
                        onChange={() => setSelectedAddressId(addr.id)}
                        className="mt-0.5"
                      />
                      <div className="text-sm">
                        <span className="font-medium text-zinc-900">
                          {addr.firstName} {addr.lastName}
                        </span>
                        <span className="text-zinc-500 ml-2">
                          {addr.address1}, {addr.city} {addr.stateOrProvince} {addr.postalCode}
                        </span>
                        {addr.isDefaultBilling && (
                          <span className="ml-2 text-xs bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded">
                            Default
                          </span>
                        )}
                        {auAddressNeedsCorrection(addr) && (
                          <span className="ml-2 text-xs bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded">
                            Needs details
                          </span>
                        )}
                      </div>
                    </label>
                  ))}
                  <label
                    className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                      selectedAddressId === "new"
                        ? "border-zinc-900 bg-zinc-50"
                        : "border-zinc-200 hover:border-zinc-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="selectedAddressId"
                      value="new"
                      checked={selectedAddressId === "new"}
                      onChange={() => setSelectedAddressId("new")}
                      className="mt-0.5"
                    />
                    <span className="text-sm font-medium text-zinc-900">
                      Enter a new address
                    </span>
                  </label>
                </div>
              </div>
            )}

            {/* A saved address we can't price — say so, and let them fix it here. */}
            {needsCorrection && (
              <div className="mb-4 rounded-lg border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                This saved address is missing a valid state or postcode, so we can&rsquo;t work
                out delivery for it. Please complete the details below — they apply to this
                order.
              </div>
            )}

            {/* Address form — hidden when using a saved address we can use as-is */}
            {showAddressForm && (
              <>
              <div className="grid grid-cols-2 gap-4" key={prefill ? `saved-${prefill.id}` : "new"}>
                <div>
                  <label className="block text-sm font-medium text-zinc-700">First Name</label>
                  <input
                    type="text"
                    name="firstName"
                    required
                    autoComplete="given-name"
                    defaultValue={seed.firstName}
                    className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700">Last Name</label>
                  <input
                    type="text"
                    name="lastName"
                    required
                    autoComplete="family-name"
                    defaultValue={seed.lastName}
                    className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                  />
                </div>
                <div className="col-span-2 relative">
                  <label className="block text-sm font-medium text-zinc-700">Address</label>
                  <input
                    ref={address1Ref}
                    type="text"
                    name="address1"
                    required
                    autoComplete="off"
                    defaultValue={prefill?.address1 ?? ""}
                    className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                  />
                  {googlePlacesEnabled && (
                    <AddressAutocomplete
                      inputRef={address1Ref}
                      onSelect={handlePlaceSelect}
                    />
                  )}
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-zinc-700">
                    Apartment, suite, etc. (optional)
                  </label>
                  <input
                    type="text"
                    name="address2"
                    defaultValue={prefill?.address2 ?? ""}
                    className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-zinc-700">
                    Phone (for delivery updates)
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    autoComplete="tel"
                    defaultValue={seed.phone}
                    className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700">City</label>
                  <input
                    ref={cityRef}
                    type="text"
                    name="city"
                    required
                    defaultValue={prefill?.city ?? ""}
                    className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700">
                    {isAu ? "State / Territory" : "State / Province"}
                  </label>
                  {isAu ? (
                    <select
                      name="state"
                      required
                      value={stateValue}
                      onChange={(e) => setStateValue(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none bg-white"
                    >
                      <option value="">Select a state…</option>
                      {AU_STATES.map((s) => (
                        <option key={s.code} value={s.code}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      name="state"
                      value={stateValue}
                      onChange={(e) => setStateValue(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                    />
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700">Postal Code</label>
                  <input
                    type="text"
                    name="postalCode"
                    required
                    value={postalCodeValue}
                    inputMode={isAu ? "numeric" : "text"}
                    maxLength={isAu ? 4 : undefined}
                    pattern={isAu ? "\\d{4}" : undefined}
                    title={isAu ? "Australian postcodes are 4 digits, e.g. 3140" : undefined}
                    placeholder={isAu ? "e.g. 3140" : undefined}
                    onChange={(e) => {
                      // AU postcodes are exactly 4 digits — reject anything else at
                      // the keystroke so a junk code can never reach the order.
                      const next = isAu
                        ? e.target.value.replace(/\D/g, "").slice(0, 4)
                        : e.target.value;
                      setPostalCodeValue(next);
                      handlePostcodeChange(next);
                    }}
                    className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                  />
                </div>
                {countries.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-zinc-700">Country</label>
                    <select
                      name="country"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none bg-white"
                    >
                      {countries.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Offer to keep a NEW address on the account. Not shown while
                  correcting a saved address (that's an edit of a row that
                  already exists), nor to guests / role-restricted contacts, nor
                  for a non-AU address — the address book is AU-only (the account
                  pages hard-code Australia and refuse an edit without a real
                  state code + 4-digit postcode), so an NZ address saved here
                  would be a row the shopper could never edit. placeOrder
                  re-checks the same `isAu` server-side. */}
              {canSaveNewAddress && isAu && !needsCorrection && (
                <label className="mt-4 flex items-center gap-2 text-sm text-zinc-700">
                  <input
                    type="checkbox"
                    name="saveAddress"
                    defaultChecked
                    className="accent-zinc-900"
                  />
                  Save this address for next time
                </label>
              )}
              </>
            )}

            {/* Hidden fields for saved address (not while it's being corrected —
                the visible form above supplies those values instead) */}
            {selectedAddress && selectedAddressId !== "new" && !needsCorrection && (
              <>
                <input type="hidden" name="firstName" value={selectedAddress.firstName} />
                <input type="hidden" name="lastName" value={selectedAddress.lastName} />
                <input type="hidden" name="address1" value={selectedAddress.address1} />
                <input type="hidden" name="address2" value={selectedAddress.address2 || ""} />
                <input type="hidden" name="city" value={selectedAddress.city} />
                <input
                  type="hidden"
                  name="state"
                  value={
                    normaliseAuState(selectedAddress.stateOrProvince) ??
                    selectedAddress.stateOrProvince
                  }
                />
                <input type="hidden" name="postalCode" value={selectedAddress.postalCode} />
                <input type="hidden" name="country" value={selectedAddress.countryCode} />
                <input type="hidden" name="phone" value={selectedAddress.phone || ""} />
              </>
            )}
          </div>

          <BulkyDeliveryChoice
            productNames={bulkyProductNames}
            value={deliveryService}
            onChange={setDeliveryService}
          />

          {/* Payment Method — replaced by an explanation when the order is held for a
              specialised delivery quote (nothing is charged, so there is nothing to choose). */}
          {heldForSpecialised ? (
            <div className="border border-zinc-200 rounded-lg p-6">
              <h2 className="text-lg font-semibold text-zinc-900 mb-2">Payment</h2>
              <p className="text-sm text-zinc-600">
                We&apos;ll price the specialised delivery, send you the total and take payment
                then. Placing this order does not charge your card.
              </p>
            </div>
          ) : (
          <div className="border border-zinc-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-zinc-900 mb-4">Payment Method</h2>
            {testMode && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <span aria-hidden className="text-base leading-none">🧪</span>
                <span>
                  <strong>Test mode</strong> — this is a test transaction and no real payment is
                  taken. Card payments use the <strong>test</strong> Stripe account; pay with{" "}
                  <span className="font-mono">4242&nbsp;4242&nbsp;4242&nbsp;4242</span>, any future
                  expiry, any CVC.
                </span>
              </div>
            )}
            {paymentMethods.length > 0 ? (
              <div className="space-y-3">
                {paymentMethods.map((method) => (
                  <div key={method.id}>
                    <label
                      className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedPaymentMethod === method.id
                          ? "border-zinc-900 bg-zinc-50"
                          : "border-zinc-200 hover:border-zinc-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="paymentMethod"
                        value={method.id}
                        checked={selectedPaymentMethod === method.id}
                        onChange={() => {
                          setSelectedPaymentMethod(method.id);
                          firePaymentInfo(method.id);
                        }}
                        className="mt-0.5"
                      />
                      <div>
                        <span className="text-sm font-medium text-zinc-900">{method.name}</span>
                        <p className="text-xs text-zinc-500 mt-0.5">{method.description}</p>
                      </div>
                    </label>

                    {/* Bank Transfer details panel */}
                    {method.id === "bank_transfer" && selectedPaymentMethod === "bank_transfer" && method.bankDetails && (
                      <div className="mt-2 ml-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-sm text-blue-800 mb-3">
                          Please transfer the total amount to the account below. Your order will be processed once payment is confirmed.
                        </p>
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                          <dt className="text-blue-600 font-medium">Bank</dt>
                          <dd className="text-blue-900">{method.bankDetails.bankName}</dd>
                          <dt className="text-blue-600 font-medium">Account Name</dt>
                          <dd className="text-blue-900">{method.bankDetails.accountName}</dd>
                          <dt className="text-blue-600 font-medium">BSB</dt>
                          <dd className="text-blue-900">{method.bankDetails.bsb}</dd>
                          <dt className="text-blue-600 font-medium">Account No.</dt>
                          <dd className="text-blue-900">{method.bankDetails.accountNumber}</dd>
                        </dl>
                        {method.bankDetails.reference && (
                          <p className="text-xs text-blue-600 mt-2">
                            Reference: {method.bankDetails.reference}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Net Terms info panel */}
                    {method.id === "net_terms" && selectedPaymentMethod === "net_terms" && (
                      <div className="mt-2 ml-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                        <p className="text-sm text-amber-800">
                          Your order will be placed immediately. An invoice with Net {method.netTermsDays ?? 30} payment terms will be sent to your email.
                        </p>
                      </div>
                    )}

                    {/* Stripe card element */}
                    {method.id === "stripe" && selectedPaymentMethod === "stripe" && stripePublishableKey && (
                      <div className="mt-2 ml-6 p-4 bg-zinc-50 border border-zinc-200 rounded-lg">
                        <label className="block text-sm font-medium text-zinc-700 mb-2">
                          Card details
                        </label>
                        <div
                          ref={cardContainerRef}
                          className="border border-zinc-300 rounded-lg px-4 py-3 bg-white focus-within:ring-2 focus-within:ring-zinc-900 focus-within:border-zinc-900 transition-shadow"
                        />
                        {stripeError && (
                          <p className="text-sm text-red-600 mt-2">{stripeError}</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : paymentUnavailable ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {PAY_UNAVAILABLE_ACCOUNT_ORDER}
              </div>
            ) : (
              <p className="text-sm text-zinc-500">
                No payment methods configured. Orders will be created with payment status &ldquo;pending&rdquo;.
              </p>
            )}
          </div>
          )}
        </div>

        {/* Order Summary */}
        <div className="lg:col-span-2">
          <div className="border border-zinc-200 rounded-lg p-6 sticky top-24">
            <h2 className="text-lg font-semibold text-zinc-900 mb-4">Order Summary</h2>

            <div className="divide-y divide-zinc-100">
              {items.map((item, i) => {
                const price = item.sale_price
                  ? parseFloat(item.sale_price)
                  : parseFloat(item.list_price);
                return (
                  <div key={i} className="py-2 flex justify-between text-sm">
                    <span className="text-zinc-600">
                      {item.product_name} &times; {item.quantity}
                    </span>
                    <Price amount={price * item.quantity} className="font-medium" />
                  </div>
                );
              })}
            </div>

            <div className="mt-4 pt-4 border-t border-zinc-200">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">Subtotal</span>
                <Price amount={subtotal} className="font-medium" />
              </div>
              <div className="flex justify-between text-sm mt-2">
                <span className="text-zinc-500">GST {pricesIncludeTax ? "(included)" : "(10%)"}</span>
                {pricesIncludeTax ? (
                  <Price amount={gstAmount} className="font-medium text-zinc-400" />
                ) : (
                  <Price amount={gstAmount} className="font-medium" />
                )}
              </div>
              <div className="flex justify-between text-sm mt-2">
                <span className="text-zinc-500">Shipping</span>
                {heldForSpecialised ? (
                  <span className="font-medium text-zinc-500 text-xs">Quoted after site check</span>
                ) : freeDelivery ? (
                  <span className="font-medium text-green-600">FREE</span>
                ) : shippingLoading ? (
                  <span className="font-medium text-zinc-400 animate-pulse">Calculating...</span>
                ) : shippingCost !== null && shippingCost > 0 ? (
                  <Price amount={shippingCost} className="font-medium" />
                ) : shippingCost === 0 ? (
                  <span className="font-medium text-green-600">FREE</span>
                ) : shippingError ? (
                  <span className="font-medium text-amber-500 text-xs">{shippingError}</span>
                ) : shippingEnabled ? (
                  <span className="font-medium text-zinc-400">Enter postcode</span>
                ) : (
                  <span className="font-medium text-zinc-400">--</span>
                )}
              </div>
              <div className="flex justify-between text-base font-semibold mt-4 pt-4 border-t border-zinc-200">
                <span>Total</span>
                <span>
                  <Price
                    amount={
                      (pricesIncludeTax ? subtotal : subtotal + gstAmount) +
                      (heldForSpecialised ? 0 : shippingCost ?? 0)
                    }
                  />
                  {heldForSpecialised && (
                    <span className="ml-1 text-xs font-normal text-zinc-500">+ delivery</span>
                  )}
                </span>
              </div>
            </div>

            {(state?.error || stripeError) && (
              <div className="mt-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">
                {state?.error || stripeError}
              </div>
            )}

            <button
              type="submit"
              disabled={
                isPending ||
                stripeProcessing ||
                (!heldForSpecialised && selectedPaymentMethod === "stripe" && !cardReady) ||
                (hasBulkyItems && deliveryService === "") ||
                shippingUnresolved ||
                paymentUnavailable
              }
              className="mt-6 w-full bg-zinc-900 text-white py-3 px-6 rounded-lg font-semibold hover:bg-zinc-800 transition-colors disabled:bg-zinc-300"
            >
              {isPending || stripeProcessing
                ? "Processing..."
                : heldForSpecialised
                  ? "Request this delivery"
                  : selectedPaymentMethod === "stripe"
                    ? "Pay Now"
                    : "Place Order"}
            </button>

            {paymentUnavailable && (
              <p className="mt-2 text-center text-xs text-zinc-500">
                {PAY_UNAVAILABLE_ACCOUNT_ORDER}
              </p>
            )}

            {hasBulkyItems && deliveryService === "" && (
              <p className="mt-2 text-center text-xs text-zinc-500">
                Choose a delivery method above to continue.
              </p>
            )}

            {shippingUnresolved && !shippingLoading && (
              <p className="mt-2 text-center text-xs text-zinc-500">
                {/* The order summary already shows WHY (bad postcode, or a zone that rates by
                    weight when some items have no weight) — repeating a postcode-only guess here
                    contradicted it. Point at the real reason instead of inventing one. */}
                {shippingError
                  ? "We can't price delivery for this order — see the reason above, or contact us for a freight quote."
                  : "Enter a delivery postcode to calculate shipping."}
              </p>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
