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
          <div className="card-padded">
            <h2 className="panel-title mb-4">Contact</h2>
            <div>
              <label className="field-label">Email</label>
              <input
                type="email"
                name="email"
                required
                defaultValue={customerEmail}
                className="mt-1 block w-full input"
                placeholder="your@email.com"
              />
            </div>
          </div>

          {/* Billing Address */}
          <div className="card-padded">
            <h2 className="panel-title mb-4">Billing Address</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="field-label">First Name</label>
                <input
                  type="text"
                  name="firstName"
                  required
                  className="mt-1 block w-full input"
                />
              </div>
              <div>
                <label className="field-label">Last Name</label>
                <input
                  type="text"
                  name="lastName"
                  required
                  className="mt-1 block w-full input"
                />
              </div>
              <div className="col-span-2">
                <label className="field-label">Address</label>
                <input
                  type="text"
                  name="address1"
                  required
                  className="mt-1 block w-full input"
                />
              </div>
              <div className="col-span-2">
                <label className="field-label">
                  Apartment, suite, etc. (optional)
                </label>
                <input
                  type="text"
                  name="address2"
                  className="mt-1 block w-full input"
                />
              </div>
              <div>
                <label className="field-label">City</label>
                <input
                  type="text"
                  name="city"
                  required
                  className="mt-1 block w-full input"
                />
              </div>
              <div>
                <label className="field-label">State / Province</label>
                <input
                  type="text"
                  name="state"
                  className="mt-1 block w-full input"
                />
              </div>
              <div>
                <label className="field-label">Postal Code</label>
                <input
                  type="text"
                  name="postalCode"
                  required
                  className="mt-1 block w-full input"
                />
              </div>
              <div>
                <label className="field-label">Country</label>
                <input
                  type="text"
                  name="country"
                  defaultValue="US"
                  className="mt-1 block w-full input"
                />
              </div>
            </div>
          </div>

          {/* Payment placeholder */}
          <div className="card-padded">
            <h2 className="panel-title mb-4">Payment</h2>
            <p className="body-text">
              Payment integration to be configured per site. Orders will be created with payment status &ldquo;pending&rdquo;.
            </p>
          </div>
        </div>

        {/* Order Summary */}
        <div className="lg:col-span-2">
          <div className="card-padded sticky top-24">
            <h2 className="panel-title mb-4">Order Summary</h2>

            <div className="divide-y divide-border">
              {items.map((item, i) => {
                const price = item.salePrice
                  ? parseFloat(item.salePrice)
                  : parseFloat(item.listPrice);
                return (
                  <div key={i} className="py-2 flex justify-between text-sm">
                    <span className="text-text-secondary">
                      {item.productName} &times; {item.quantity}
                    </span>
                    <Price amount={price * item.quantity} className="font-medium" />
                  </div>
                );
              })}
            </div>

            <div className="mt-4 pt-4 border-t border-border">
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">Subtotal</span>
                <Price amount={subtotal} className="font-medium" />
              </div>
              <div className="flex justify-between text-sm mt-2">
                <span className="text-text-secondary">Shipping</span>
                <span className="font-medium text-text-muted">--</span>
              </div>
              <div className="flex justify-between text-base font-semibold mt-4 pt-4 border-t border-border">
                <span>Total</span>
                <span><Price amount={subtotal} /></span>
              </div>
            </div>

            {state?.error && (
              <div className="mt-4 alert-error">
                {state.error}
              </div>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="btn-primary w-full mt-6"
            >
              {isPending ? "Placing order..." : "Place Order"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
