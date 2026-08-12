"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { getCart } from "@/lib/actions/cart";
import { getSessionInfo } from "@/lib/actions/account-panel";
import { Price } from "@/components/ui/Price";
import { CartItemsList } from "./CartItemsList";
import { usePanelContext } from "@/components/ui/PanelContext";
import { useHeaderPanels } from "@/lib/cart-quote-counts";

type CartData = Awaited<ReturnType<typeof getCart>>;

export function CartPanel() {
  const { isOpen, close } = usePanelContext();
  const { open } = useHeaderPanels();
  const [cart, setCart] = useState<CartData>(null);
  // null while unknown: the sign-in offer must not flash at a customer who IS
  // signed in on the way to finding that out.
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (isOpen) {
      startTransition(async () => {
        const [data, info] = await Promise.all([getCart(), getSessionInfo()]);
        setCart(data);
        setSignedIn(!!info);
      });
    }
  }, [isOpen]);

  // Re-fetch the cart into panel state after a mutation (+/- / remove). The panel
  // holds items in client state, so a server action's revalidatePath alone does NOT
  // update this view — without this callback the quantity never changes on screen
  // and the buttons look dead. Kept OUT of startTransition so the whole panel
  // doesn't flash its loading spinner on every click (the row shows its own pending
  // state instead).
  const refreshCart = useCallback(async () => {
    const data = await getCart();
    setCart(data);
  }, []);

  const items = cart?.items ?? [];
  const subtotal = parseFloat(cart?.base_amount ?? "0");

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-text-primary" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6">
        <ShoppingCart className="h-16 w-16 text-text-muted" strokeWidth={1.5} />
        <p className="mt-4 text-text-secondary">Your cart is empty.</p>
        <button
          onClick={close}
          className="btn-primary mt-6"
        >
          Continue Shopping
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <CartItemsList items={items} onMutate={refreshCart} />
      </div>

      {/* Footer */}
      <div className="border-t border-border px-6 py-4 space-y-3">
        {signedIn === false && (
          <p className="text-xs text-text-secondary">
            Have an account?{" "}
            <button
              type="button"
              onClick={() => open("account", { view: "login", returnTo: "cart" })}
              className="font-medium text-text-primary underline hover:no-underline"
            >
              Sign in
            </button>{" "}
            or{" "}
            <button
              type="button"
              onClick={() => open("account", { view: "register", returnTo: "cart" })}
              className="font-medium text-text-primary underline hover:no-underline"
            >
              create one
            </button>{" "}
            to check out with your saved details and your account pricing.
          </p>
        )}
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-text-secondary">Subtotal</span>
          <Price amount={subtotal} className="font-semibold text-text-primary" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/cart"
            className="btn-secondary text-center"
          >
            View Cart
          </Link>
          <Link
            href="/checkout"
            className="btn-primary text-center"
          >
            Checkout
          </Link>
        </div>
      </div>
    </div>
  );
}
