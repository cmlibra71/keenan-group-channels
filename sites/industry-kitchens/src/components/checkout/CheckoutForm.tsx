"use client";

import { useActionState, useState, useRef, useCallback } from "react";
import { placeOrder } from "@/lib/actions/checkout";
import { Price } from "@/components/ui/Price";
import { AddressAutocomplete } from "@/components/checkout/AddressAutocomplete";

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

type PaymentMethod = {
  id: string;
  name: string;
  description: string;
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
}) {
  const [state, formAction, isPending] = useActionState(placeOrder, null);
  const [selectedAddressId, setSelectedAddressId] = useState<number | "new">(
    () => savedAddresses.find((a) => a.isDefaultBilling)?.id ?? "new"
  );

  // Refs for address autocomplete
  const address1Ref = useRef<HTMLInputElement>(null);
  const cityRef = useRef<HTMLInputElement>(null);
  const stateRef = useRef<HTMLInputElement>(null);
  const postalCodeRef = useRef<HTMLInputElement>(null);
  const countryRef = useRef<HTMLSelectElement>(null);

  const handlePlaceSelect = useCallback(
    (place: { address1: string; city: string; state: string; postalCode: string; countryCode: string }) => {
      if (address1Ref.current) address1Ref.current.value = place.address1;
      if (cityRef.current) cityRef.current.value = place.city;
      if (stateRef.current) stateRef.current.value = place.state;
      if (postalCodeRef.current) postalCodeRef.current.value = place.postalCode;
      if (countryRef.current) countryRef.current.value = place.countryCode;
    },
    []
  );

  const selectedAddress = savedAddresses.find((a) => a.id === selectedAddressId);

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
                {paymentMethods.map((method, i) => (
                  <label
                    key={method.id}
                    className="flex items-start gap-3 p-3 border border-zinc-200 rounded-lg cursor-pointer has-[:checked]:border-zinc-900 has-[:checked]:bg-zinc-50"
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      value={method.id}
                      defaultChecked={i === 0}
                      className="mt-0.5"
                    />
                    <div>
                      <span className="text-sm font-medium text-zinc-900">{method.name}</span>
                      <p className="text-xs text-zinc-500 mt-0.5">{method.description}</p>
                    </div>
                  </label>
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
                ) : (
                  <span className="font-medium text-zinc-400">--</span>
                )}
              </div>
              <div className="flex justify-between text-base font-semibold mt-4 pt-4 border-t border-zinc-200">
                <span>Total</span>
                <span><Price amount={pricesIncludeTax ? subtotal : subtotal + gstAmount} /></span>
              </div>
            </div>

            {state?.error && (
              <div className="mt-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">
                {state.error}
              </div>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="mt-6 w-full bg-zinc-900 text-white py-3 px-6 rounded-lg font-semibold hover:bg-zinc-800 transition-colors disabled:bg-zinc-300"
            >
              {isPending ? "Placing order..." : "Place Order"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
