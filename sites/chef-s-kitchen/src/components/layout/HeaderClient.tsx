"use client";

import { useState, useCallback, useEffect } from "react";
import { ShoppingCart, FileText, Crown, User } from "lucide-react";
import { SlidePanel } from "@/components/ui/SlidePanel";
import { CartPanel } from "@/components/cart/CartPanel";
import { QuotePanel } from "@/components/quote/QuotePanel";
import { AccountPanel } from "@/components/account/AccountPanel";
import { useCartQuoteCounts } from "@/lib/cart-quote-counts";

export function HeaderClient({
  cartCount: serverCartCount,
  quoteCount: serverQuoteCount,
  isMember,
  entryCount,
}: {
  cartCount: number;
  quoteCount: number;
  isMember?: boolean;
  entryCount?: number;
}) {
  const [cartOpen, setCartOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const closeCart = useCallback(() => setCartOpen(false), []);
  const closeQuote = useCallback(() => setQuoteOpen(false), []);
  const closeAccount = useCallback(() => setAccountOpen(false), []);

  // Badges read the client counts (pushed by cart/quote mutations without any
  // route re-render); server props re-seed on any real route re-render.
  const { cartCount: ctxCartCount, quoteCount: ctxQuoteCount, seed } = useCartQuoteCounts();
  useEffect(() => {
    seed(serverCartCount, serverQuoteCount);
  }, [serverCartCount, serverQuoteCount, seed]);
  const cartCount = ctxCartCount ?? serverCartCount;
  const quoteCount = ctxQuoteCount ?? serverQuoteCount;

  return (
    <>
      {/* Quote button */}
      <button
        onClick={() => setQuoteOpen(true)}
        className="relative text-white transition-colors duration-200 hover:text-white/80"
        aria-label="Open quote"
      >
        <FileText className="h-[22px] w-[22px]" strokeWidth={1.7} />
        {quoteCount > 0 && (
          <span className="absolute -top-[7px] -right-[9px] grid h-[17px] min-w-[17px] place-items-center rounded-full bg-member px-0.5 text-[10px] font-bold text-ink-900">
            {quoteCount > 99 ? "99+" : quoteCount}
          </span>
        )}
      </button>

      {/* Cart button */}
      <button
        onClick={() => setCartOpen(true)}
        className="relative text-white transition-colors duration-200 hover:text-white/80"
        aria-label="Open cart"
      >
        <ShoppingCart className="h-[22px] w-[22px]" strokeWidth={1.7} />
        {cartCount > 0 && (
          <span className="absolute -top-[7px] -right-[9px] grid h-[17px] min-w-[17px] place-items-center rounded-full bg-member px-0.5 text-[10px] font-bold text-ink-900">
            {cartCount > 99 ? "99+" : cartCount}
          </span>
        )}
      </button>

      {/* Account button */}
      <button
        onClick={() => setAccountOpen(true)}
        className="hidden sm:flex items-center gap-[7px] text-white text-sm font-medium transition-colors duration-200 hover:text-white/80"
        aria-label="Open account"
      >
        <User className="h-[22px] w-[22px]" strokeWidth={1.7} />
        {isMember && (
          <span className="relative">
            <Crown className="h-3.5 w-3.5 text-member-bright" />
            {entryCount != null && entryCount > 0 && (
              <span className="absolute -top-2 -right-3 bg-accent text-white text-[9px] font-medium rounded-full h-3.5 min-w-[14px] flex items-center justify-center px-0.5">
                {entryCount > 99 ? "99+" : entryCount}
              </span>
            )}
          </span>
        )}
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
