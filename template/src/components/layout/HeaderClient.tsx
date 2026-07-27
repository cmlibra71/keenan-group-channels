"use client";

import { useEffect } from "react";
import { ShoppingCart, FileText, Crown } from "lucide-react";
import { useCartQuoteCounts, useHeaderPanels } from "@/lib/cart-quote-counts";

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
  // The panels themselves live in <HeaderPanels />, rendered once outside the
  // header — these buttons only raise the shared open signal.
  const { open } = useHeaderPanels();

  // Badges read the client counts (pushed by cart/quote mutations without any
  // route re-render); the server-rendered props stay authoritative whenever the
  // route ACTUALLY re-renders (hard load, submit/auth refresh flows) — re-seed
  // on prop change. First paint uses the props (context is null pre-effect).
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
        onClick={() => open("quote")}
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
        onClick={() => open("cart")}
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
        onClick={() => open("account")}
        className="hidden sm:flex items-center gap-1.5 text-sm font-medium text-zinc-600 hover:text-zinc-900"
        aria-label="Open account"
      >
        {isMember && (
          <span className="relative">
            <Crown className="h-4 w-4 text-amber-500" />
            {entryCount != null && entryCount > 0 && (
              <span className="absolute -top-2 -right-3 bg-amber-500 text-white text-[10px] font-bold rounded-full h-3.5 min-w-[14px] flex items-center justify-center px-0.5">
                {entryCount > 99 ? "99+" : entryCount}
              </span>
            )}
          </span>
        )}
        Account
      </button>
    </>
  );
}
