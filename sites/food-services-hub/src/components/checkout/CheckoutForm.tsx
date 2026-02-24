"use client";

import { useActionState } from "react";
import { placeOrder } from "@/lib/actions/checkout";
import { Price } from "@/components/ui/Price";

type CartItem = {
  productName: string;
  quantity: number;
  listPrice: string;
  salePrice: string | null;
};

export function CheckoutForm({
  items,
  subtotal,
  customerEmail,
}: {
  items: CartItem[];
  subtotal: number;
  customerEmail?: string;
}) {
  const [state, formAction, isPending] = useActionState(placeOrder, null);

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
              <div className="col-span-2">
                <label className="block text-sm font-medium text-zinc-700">Address</label>
                <input
                  type="text"
                  name="address1"
                  required
                  className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                />
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
                  type="text"
                  name="city"
                  required
                  className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700">State / Province</label>
                <input
                  type="text"
                  name="state"
                  className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700">Postal Code</label>
                <input
                  type="text"
                  name="postalCode"
                  required
                  className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700">Country</label>
                <input
                  type="text"
                  name="country"
                  defaultValue="US"
                  className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Payment placeholder */}
          <div className="border border-zinc-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-zinc-900 mb-4">Payment</h2>
            <p className="text-sm text-zinc-500">
              Payment integration to be configured per site. Orders will be created with payment status &ldquo;pending&rdquo;.
            </p>
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
                <span className="text-zinc-500">Shipping</span>
                <span className="font-medium text-zinc-400">--</span>
              </div>
              <div className="flex justify-between text-base font-semibold mt-4 pt-4 border-t border-zinc-200">
                <span>Total</span>
                <span><Price amount={subtotal} /></span>
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
