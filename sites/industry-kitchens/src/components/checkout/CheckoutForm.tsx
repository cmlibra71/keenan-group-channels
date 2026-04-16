"use client";

import { useActionState, useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { placeOrder, confirmStripePayment } from "@/lib/actions/checkout";
import { Price } from "@/components/ui/Price";
import { AddressAutocomplete } from "@/components/checkout/AddressAutocomplete";

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
  productName: string;
  quantity: number;
  listPrice: string;
  salePrice: string | null;
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
  isDefaultBilling: boolean;
};

export function CheckoutForm({
  items,
  subtotal,
  gstAmount,
  isMember,
  pricesIncludeTax,
  customerEmail,
  countries = [],
  paymentMethods = [],
  savedAddresses = [],
  googlePlacesEnabled = false,
  freeShippingEnabled = false,
  freeShippingThreshold = 500,
  shippingEnabled = false,
  stripePublishableKey,
}: {
  items: CartItem[];
  subtotal: number;
  gstAmount: number;
  isMember?: boolean;
  pricesIncludeTax?: boolean;
  customerEmail?: string;
  countries?: Country[];
  paymentMethods?: PaymentMethod[];
  savedAddresses?: SavedAddress[];
  googlePlacesEnabled?: boolean;
  freeShippingEnabled?: boolean;
  freeShippingThreshold?: number;
  shippingEnabled?: boolean;
  stripePublishableKey?: string;
}) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(placeOrder, null);
  const [selectedAddressId, setSelectedAddressId] = useState<number | "new">(
    () => savedAddresses.find((a) => a.isDefaultBilling)?.id ?? "new"
  );
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>(
    () => paymentMethods[0]?.id ?? ""
  );
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
  const stateRef = useRef<HTMLInputElement>(null);
  const postalCodeRef = useRef<HTMLInputElement>(null);
  const countryRef = useRef<HTMLSelectElement>(null);

  // Shipping calculation state
  const [shippingCost, setShippingCost] = useState<number | null>(null);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [shippingError, setShippingError] = useState<string | null>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  const calculateShippingCost = useCallback(
    async (postcode: string) => {
      if (!shippingEnabled || !postcode || postcode.length < 3) {
        setShippingCost(null);
        setShippingError(null);
        return;
      }

      // Don't calculate if free shipping applies
      if (freeShippingEnabled && isMember && subtotal >= freeShippingThreshold) {
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
    [shippingEnabled, subtotal, freeShippingEnabled, isMember, freeShippingThreshold]
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
      if (stateRef.current) stateRef.current.value = place.state;
      if (postalCodeRef.current) postalCodeRef.current.value = place.postalCode;
      if (countryRef.current) countryRef.current.value = place.countryCode;
      // Trigger shipping calculation when address is autocompleted
      if (place.postalCode) {
        calculateShippingCost(place.postalCode);
      }
    },
    [calculateShippingCost]
  );

  const selectedAddress = savedAddresses.find((a) => a.id === selectedAddressId);

  // Recalculate shipping when a saved address is selected
  useEffect(() => {
    if (selectedAddress && shippingEnabled) {
      calculateShippingCost(selectedAddress.postalCode);
    }
  }, [selectedAddressId, selectedAddress, shippingEnabled, calculateShippingCost]);

  return (
    <form action={formAction}>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        <div className="lg:col-span-3 space-y-6">
          {/* Contact */}
          <div className="border border-zinc-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-zinc-900 mb-4">Contact</h2>
            <div>
              <label className="block text-sm font-medium text-zinc-700">Email</label>
              <input
                type="email"
                name="email"
                required
                defaultValue={customerEmail}
                className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                placeholder="your@email.com"
              />
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

            {/* Address form — hidden when using a saved address */}
            {(selectedAddressId === "new" || savedAddresses.length === 0) && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700">First Name</label>
                  <input
                    type="text"
                    name="firstName"
                    required
                    className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700">Last Name</label>
                  <input
                    type="text"
                    name="lastName"
                    required
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
                    className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700">State / Province</label>
                  <input
                    ref={stateRef}
                    type="text"
                    name="state"
                    className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700">Postal Code</label>
                  <input
                    ref={postalCodeRef}
                    type="text"
                    name="postalCode"
                    required
                    onChange={(e) => handlePostcodeChange(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                  />
                </div>
                {countries.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-zinc-700">Country</label>
                    <select
                      ref={countryRef}
                      name="country"
                      defaultValue={countries[0]?.code || "AU"}
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
            )}

            {/* Hidden fields for saved address */}
            {selectedAddress && selectedAddressId !== "new" && (
              <>
                <input type="hidden" name="firstName" value={selectedAddress.firstName} />
                <input type="hidden" name="lastName" value={selectedAddress.lastName} />
                <input type="hidden" name="address1" value={selectedAddress.address1} />
                <input type="hidden" name="address2" value={selectedAddress.address2 || ""} />
                <input type="hidden" name="city" value={selectedAddress.city} />
                <input type="hidden" name="state" value={selectedAddress.stateOrProvince} />
                <input type="hidden" name="postalCode" value={selectedAddress.postalCode} />
                <input type="hidden" name="country" value={selectedAddress.countryCode} />
              </>
            )}
          </div>

          {/* Payment Method */}
          <div className="border border-zinc-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-zinc-900 mb-4">Payment Method</h2>
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
                        onChange={() => setSelectedPaymentMethod(method.id)}
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
            ) : (
              <p className="text-sm text-zinc-500">
                No payment methods configured. Orders will be created with payment status &ldquo;pending&rdquo;.
              </p>
            )}
          </div>
        </div>

        {/* Order Summary */}
        <div className="lg:col-span-2">
          <div className="border border-zinc-200 rounded-lg p-6 sticky top-24">
            <h2 className="text-lg font-semibold text-zinc-900 mb-4">Order Summary</h2>

            <div className="divide-y divide-zinc-100">
              {items.map((item, i) => {
                const price = item.salePrice
                  ? parseFloat(item.salePrice)
                  : parseFloat(item.listPrice);
                return (
                  <div key={i} className="py-2 flex justify-between text-sm">
                    <span className="text-zinc-600">
                      {item.productName} &times; {item.quantity}
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
                {freeShippingEnabled && isMember && subtotal >= freeShippingThreshold ? (
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
              <input type="hidden" name="shippingCost" value={shippingCost ?? "0"} />
              <div className="flex justify-between text-base font-semibold mt-4 pt-4 border-t border-zinc-200">
                <span>Total</span>
                <span><Price amount={(pricesIncludeTax ? subtotal : subtotal + gstAmount) + (shippingCost ?? 0)} /></span>
              </div>
            </div>

            {(state?.error || stripeError) && (
              <div className="mt-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">
                {state?.error || stripeError}
              </div>
            )}

            <button
              type="submit"
              disabled={isPending || stripeProcessing || (selectedPaymentMethod === "stripe" && !cardReady)}
              className="mt-6 w-full bg-zinc-900 text-white py-3 px-6 rounded-lg font-semibold hover:bg-zinc-800 transition-colors disabled:bg-zinc-300"
            >
              {isPending || stripeProcessing ? "Processing..." : selectedPaymentMethod === "stripe" ? "Pay Now" : "Place Order"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
