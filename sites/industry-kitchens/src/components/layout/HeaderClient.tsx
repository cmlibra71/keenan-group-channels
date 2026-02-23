"use client";

import { useState, useCallback } from "react";
import { ShoppingCart, FileText } from "lucide-react";
import { SlidePanel } from "@/components/ui/SlidePanel";
import { CartPanel } from "@/components/cart/CartPanel";
import { QuotePanel } from "@/components/quote/QuotePanel";
import { AccountPanel } from "@/components/account/AccountPanel";

export function HeaderClient({ cartCount, quoteCount }: { cartCount: number; quoteCount: number }) {
  const [cartOpen, setCartOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const closeCart = useCallback(() => setCartOpen(false), []);
  const closeQuote = useCallback(() => setQuoteOpen(false), []);
  const closeAccount = useCallback(() => setAccountOpen(false), []);

  return (
    <>
      {/* Quote button */}
      <button
        onClick={() => setQuoteOpen(true)}
        className="relative text-zinc-600 hover:text-zinc-900"
        aria-label="Open quote"
      >
        <FileText className="h-5 w-5" />
        {quoteCount > 0 && (
          <span className="absolute -top-2 -right-2 bg-zinc-900 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">
            {quoteCount > 99 ? "99+" : quoteCount}
          </span>
        )}
      </button>

      {/* Cart button */}
      <button
        onClick={() => setCartOpen(true)}
        className="relative text-zinc-600 hover:text-zinc-900"
        aria-label="Open cart"
      >
        <ShoppingCart className="h-5 w-5" />
        {cartCount > 0 && (
          <span className="absolute -top-2 -right-2 bg-zinc-900 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">
            {cartCount > 99 ? "99+" : cartCount}
          </span>
        )}
      </button>

      {/* Account button */}
      <button
        onClick={() => setAccountOpen(true)}
        className="hidden sm:block text-sm font-medium text-zinc-600 hover:text-zinc-900"
        aria-label="Open account"
      >
        Account
      </button>

      {/* Quote panel */}
      <SlidePanel isOpen={quoteOpen} onClose={closeQuote} title="Your Quote">
        <QuotePanel />
      </SlidePanel>

      {/* Cart panel */}
      <SlidePanel isOpen={cartOpen} onClose={closeCart} title="Your Cart">
        <CartPanel />
      </SlidePanel>

      {/* Account panel */}
      <SlidePanel isOpen={accountOpen} onClose={closeAccount} title="Account">
        <AccountPanel />
      </SlidePanel>
    </>
  );
}
