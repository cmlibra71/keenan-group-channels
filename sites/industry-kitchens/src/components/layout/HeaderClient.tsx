"use client";

import { useState, useCallback } from "react";
import { ShoppingCart, LayoutGrid, User, Crown } from "lucide-react";
import { SlidePanel } from "@/components/ui/SlidePanel";
import { CartPanel } from "@/components/cart/CartPanel";
import { QuotePanel } from "@/components/quote/QuotePanel";
import { AccountPanel } from "@/components/account/AccountPanel";

export function HeaderClient({
  cartCount,
  quoteCount,
  isMember,
  entryCount,
  compact = false,
}: {
  cartCount: number;
  quoteCount: number;
  isMember?: boolean;
  entryCount?: number;
  compact?: boolean;
}) {
  const [cartOpen, setCartOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const closeCart = useCallback(() => setCartOpen(false), []);
  const closeQuote = useCallback(() => setQuoteOpen(false), []);
  const closeAccount = useCallback(() => setAccountOpen(false), []);

  const panels = (
    <>
      <SlidePanel isOpen={quoteOpen} onClose={closeQuote} title="Your Quote">
        <QuotePanel />
      </SlidePanel>
      <SlidePanel isOpen={cartOpen} onClose={closeCart} title="Your Cart">
        <CartPanel />
      </SlidePanel>
      <SlidePanel isOpen={accountOpen} onClose={closeAccount} title="Account">
        <AccountPanel />
      </SlidePanel>
    </>
  );

  if (compact) {
    return (
      <>
        <button
          onClick={() => setQuoteOpen(true)}
          className="relative p-2 text-zinc-700"
          aria-label="Open quote"
        >
          <LayoutGrid className="h-5 w-5" />
          {quoteCount > 0 && (
            <span className="absolute top-0 right-0 bg-[#D94B2B] text-white text-[10px] font-bold rounded-full h-4 min-w-[16px] flex items-center justify-center px-1">
              {quoteCount > 99 ? "99+" : quoteCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setCartOpen(true)}
          className="relative p-2 text-zinc-700"
          aria-label="Open cart"
        >
          <ShoppingCart className="h-5 w-5" />
          {cartCount > 0 && (
            <span className="absolute top-0 right-0 bg-[#D94B2B] text-white text-[10px] font-bold rounded-full h-4 min-w-[16px] flex items-center justify-center px-1">
              {cartCount > 99 ? "99+" : cartCount}
            </span>
          )}
        </button>
        {panels}
      </>
    );
  }

  return (
    <>
      {/* Sign In / Register */}
      <button
        onClick={() => setAccountOpen(true)}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-zinc-600 hover:text-[#D94B2B] transition-colors whitespace-nowrap"
        aria-label="Account"
      >
        {isMember ? (
          <span className="relative">
            <Crown className="h-4 w-4 text-amber-500" />
            {entryCount != null && entryCount > 0 && (
              <span className="absolute -top-2 -right-3 bg-amber-500 text-white text-[10px] font-bold rounded-full h-3.5 min-w-[14px] flex items-center justify-center px-0.5">
                {entryCount > 99 ? "99+" : entryCount}
              </span>
            )}
          </span>
        ) : (
          <User className="h-4 w-4" />
        )}
        {isMember ? "Account" : "Sign In/Register"}
      </button>

      {/* Quote */}
      <button
        onClick={() => setQuoteOpen(true)}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-zinc-600 hover:text-[#D94B2B] transition-colors whitespace-nowrap"
        aria-label="Open quote"
      >
        <LayoutGrid className="h-4 w-4" />
        Quote ({quoteCount})
      </button>

      {/* Cart */}
      <button
        onClick={() => setCartOpen(true)}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-zinc-600 hover:text-[#D94B2B] transition-colors whitespace-nowrap"
        aria-label="Open cart"
      >
        <ShoppingCart className="h-4 w-4" />
        Cart ({cartCount})
      </button>

      {panels}
    </>
  );
}
