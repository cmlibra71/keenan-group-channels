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
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6">
        <ShoppingCart className="h-16 w-16 text-zinc-300" />
        <p className="mt-4 text-zinc-500">Your cart is empty.</p>
        <button
          onClick={close}
          className="mt-6 inline-block bg-zinc-900 text-white px-6 py-3 rounded-lg font-semibold hover:bg-zinc-800 transition-colors text-sm"
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
      <div className="border-t border-zinc-200 px-6 py-4 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-zinc-600">Subtotal</span>
          <Price amount={subtotal} className="font-semibold text-zinc-900" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/cart"
            className="text-center border border-zinc-300 text-zinc-700 py-2.5 px-4 rounded-lg font-semibold hover:bg-zinc-50 transition-colors text-sm"
          >
            View Cart
          </Link>
          <Link
            href="/checkout"
            className="text-center bg-zinc-900 text-white py-2.5 px-4 rounded-lg font-semibold hover:bg-zinc-800 transition-colors text-sm"
          >
            Checkout
          </Link>
        </div>
      </div>
    </div>
  );
}
