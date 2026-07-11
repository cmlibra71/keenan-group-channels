"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { getCart } from "@/lib/actions/cart";
import { CartItemsList, type CartItemRow } from "@/components/cart/CartItemsList";
import { CartSummary } from "@/components/cart/CartSummary";
import { MembershipCartUpsell } from "@/components/cart/MembershipCartUpsell";
import { useCartQuoteCounts } from "@/lib/cart-quote-counts";

/**
 * Client island for the /cart page body. Quantity changes update rows and
 * totals in place: the row's server action re-prices the line (bulk tiers),
 * `onMutate` re-fetches the cart via getCart() — no route re-render, no
 * pricing math re-derived client-side. Holds both the filled and empty states
 * so removing the last item swaps views without navigation.
 */
type CartData = {
  items: CartItemRow[];
  cart_amount: string | null;
} | null;

export function CartPageClient({
  initialCart,
  pricesIncludeTax,
  isMember,
  freeShippingEnabled,
  freeShippingThreshold,
  upsell,
}: {
  initialCart: CartData;
  pricesIncludeTax: boolean;
  isMember: boolean;
  freeShippingEnabled: boolean;
  freeShippingThreshold: number;
  upsell: { planPrice: number; billingInterval: string; savingsPercentage: number } | null;
}) {
  const [cart, setCart] = useState<CartData>(initialCart);
  const mutationInFlight = useRef(false);

  const onMutate = useCallback(async () => {
    mutationInFlight.current = true;
    try {
      setCart((await getCart()) as CartData);
    } finally {
      mutationInFlight.current = false;
    }
  }, []);

  // Reconcile with mutations made elsewhere (the slide-out cart panel while
  // sitting on /cart): the badge count is pushed by every cart mutation, so a
  // mismatch with our local items means our copy is stale.
  const { cartCount } = useCartQuoteCounts();
  const items = cart?.items ?? [];
  const localCount = items.reduce((sum, i) => sum + i.quantity, 0);
  useEffect(() => {
    if (cartCount != null && cartCount !== localCount && !mutationInFlight.current) {
      void onMutate();
    }
    // localCount deliberately not a dep — reconcile on the external signal only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartCount]);

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="page-title mb-8">Your Cart</h1>
        <div className="text-center py-16">
          <ShoppingCart className="h-16 w-16 text-steel-300 mx-auto" />
          <p className="mt-4 text-steel-500">Your cart is empty.</p>
          <Link
            href="/products"
            className="btn-primary mt-6 inline-flex"
          >
            Continue Shopping
          </Link>
        </div>
      </div>
    );
  }

  // Member savings flow through item salePrice (cart.discountAmount stays 0),
  // so compute the discount from the items: full list value minus what's
  // actually charged. Subtotal shows the undiscounted (RRP) value.
  const subtotal = items.reduce(
    (sum, i) => sum + (i.list_price ? parseFloat(i.list_price) : 0) * i.quantity,
    0
  );
  const total = parseFloat(cart?.cart_amount ?? "0");
  const discount = Math.max(0, Math.round((subtotal - total) * 100) / 100);

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="page-title mb-8">Your Cart</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <CartItemsList items={items} onMutate={onMutate} />
        </div>
        <div className="space-y-4">
          <CartSummary
            subtotal={subtotal}
            discount={discount}
            total={total}
            isMember={isMember}
            pricesIncludeTax={pricesIncludeTax}
            freeShippingEnabled={freeShippingEnabled}
            freeShippingThreshold={freeShippingThreshold}
          />
          {upsell && (
            <MembershipCartUpsell
              cartTotal={total}
              planPrice={upsell.planPrice}
              billingInterval={upsell.billingInterval}
              savingsPercentage={upsell.savingsPercentage}
              freeShippingEnabled={freeShippingEnabled}
              freeShippingThreshold={freeShippingThreshold}
            />
          )}
        </div>
      </div>
    </div>
  );
}
