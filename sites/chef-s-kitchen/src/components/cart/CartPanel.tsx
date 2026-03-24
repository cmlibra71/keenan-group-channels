"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { getCart } from "@/lib/actions/cart";
import { Price } from "@/components/ui/Price";
import { CartItemsList } from "./CartItemsList";
import { usePanelContext } from "@/components/ui/PanelContext";

type CartData = Awaited<ReturnType<typeof getCart>>;

export function CartPanel() {
  const { isOpen, close } = usePanelContext();
  const [cart, setCart] = useState<CartData>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (isOpen) {
      startTransition(async () => {
        const data = await getCart();
        setCart(data);
      });
    }
  }, [isOpen]);

  const items = cart?.items ?? [];
  const subtotal = parseFloat(cart?.baseAmount ?? "0");

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-stone border-t-navy" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6">
        <ShoppingCart className="h-16 w-16 text-ink-faint" strokeWidth={1.5} />
        <p className="mt-4 text-ink-light">Your cart is empty.</p>
        <button
          onClick={close}
          className="mt-6 inline-block bg-teal text-white px-7 py-3.5 font-medium text-sm tracking-wide hover:bg-teal-light transition-colors duration-300"
        >
          Continue Shopping
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <CartItemsList items={items} />
      </div>

      {/* Footer */}
      <div className="border-t border-stone px-6 py-4 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-ink-light">Subtotal</span>
          <Price amount={subtotal} className="font-semibold text-navy" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/cart"
            className="text-center border border-stone text-ink hover:border-navy/30 transition-colors duration-300 py-2.5 px-4 font-semibold text-sm"
          >
            View Cart
          </Link>
          <Link
            href="/checkout"
            className="text-center bg-teal text-white px-7 py-2.5 font-medium text-sm tracking-wide hover:bg-teal-light transition-colors duration-300"
          >
            Checkout
          </Link>
        </div>
      </div>
    </div>
  );
}
