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
          <div className="border border-stone p-6">
            <h2 className="text-lg heading-serif text-navy mb-4">Contact</h2>
            <div>
              <label className="block text-sm font-medium text-ink">Email</label>
              <input
                type="email"
                name="email"
                required
                defaultValue={customerEmail}
                className="mt-1 block w-full border border-stone px-3 py-2 text-sm focus:border-navy focus:outline-none"
                placeholder="your@email.com"
              />
            </div>
          </div>

          {/* Billing Address */}
          <div className="border border-stone p-6">
            <h2 className="text-lg heading-serif text-navy mb-4">Billing Address</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ink">First Name</label>
                <input
                  type="text"
                  name="firstName"
                  required
                  className="mt-1 block w-full border border-stone px-3 py-2 text-sm focus:border-navy focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink">Last Name</label>
                <input
                  type="text"
                  name="lastName"
                  required
                  className="mt-1 block w-full border border-stone px-3 py-2 text-sm focus:border-navy focus:outline-none"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-ink">Address</label>
                <input
                  type="text"
                  name="address1"
                  required
                  className="mt-1 block w-full border border-stone px-3 py-2 text-sm focus:border-navy focus:outline-none"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-ink">
                  Apartment, suite, etc. (optional)
                </label>
                <input
                  type="text"
                  name="address2"
                  className="mt-1 block w-full border border-stone px-3 py-2 text-sm focus:border-navy focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink">City</label>
                <input
                  type="text"
                  name="city"
                  required
                  className="mt-1 block w-full border border-stone px-3 py-2 text-sm focus:border-navy focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink">State / Province</label>
                <input
                  type="text"
                  name="state"
                  className="mt-1 block w-full border border-stone px-3 py-2 text-sm focus:border-navy focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink">Postal Code</label>
                <input
                  type="text"
                  name="postalCode"
                  required
                  className="mt-1 block w-full border border-stone px-3 py-2 text-sm focus:border-navy focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink">Country</label>
                <input
                  type="text"
                  name="country"
                  defaultValue="US"
                  className="mt-1 block w-full border border-stone px-3 py-2 text-sm focus:border-navy focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Payment placeholder */}
          <div className="border border-stone p-6">
            <h2 className="text-lg heading-serif text-navy mb-4">Payment</h2>
            <p className="text-sm text-ink-light">
              Payment integration to be configured per site. Orders will be created with payment status &ldquo;pending&rdquo;.
            </p>
          </div>
        </div>

        {/* Order Summary */}
        <div className="lg:col-span-2">
          <div className="border border-stone p-6 sticky top-24">
            <h2 className="text-lg heading-serif text-navy mb-4">Order Summary</h2>

            <div className="divide-y divide-stone">
              {items.map((item, i) => {
                const price = item.salePrice
                  ? parseFloat(item.salePrice)
                  : parseFloat(item.listPrice);
                return (
                  <div key={i} className="py-2 flex justify-between text-sm">
                    <span className="text-ink-light">
                      {item.productName} &times; {item.quantity}
                    </span>
                    <Price amount={price * item.quantity} className="font-medium" />
                  </div>
                );
              })}
            </div>

            <div className="mt-4 pt-4 border-t border-stone">
              <div className="flex justify-between text-sm">
                <span className="text-ink-light">Subtotal</span>
                <Price amount={subtotal} className="font-medium" />
              </div>
              <div className="flex justify-between text-sm mt-2">
                <span className="text-ink-light">Shipping</span>
                <span className="font-medium text-ink-faint">--</span>
              </div>
              <div className="flex justify-between text-base font-semibold mt-4 pt-4 border-t border-stone">
                <span>Total</span>
                <span><Price amount={subtotal} /></span>
              </div>
            </div>

            {state?.error && (
              <div className="mt-4 p-3 bg-red-50 text-red-700 text-sm">
                {state.error}
              </div>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="mt-6 w-full bg-teal text-white px-7 py-3.5 font-medium text-sm tracking-wide hover:bg-teal-light transition-colors duration-300 disabled:bg-stone-warm disabled:text-ink-faint"
            >
              {isPending ? "Placing order..." : "Place Order"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
