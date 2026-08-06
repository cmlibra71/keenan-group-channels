"use client";

import { useEffect } from "react";
import { ShoppingCart, LayoutGrid, User, Crown } from "lucide-react";
import { useCartQuoteCounts, useHeaderPanels } from "@/lib/cart-quote-counts";

export function HeaderClient({
  cartCount: serverCartCount,
  quoteCount: serverQuoteCount,
  isMember,
  entryCount,
  drawsEnabled,
  variant = "full",
}: {
  cartCount: number;
  quoteCount: number;
  isMember?: boolean;
  entryCount?: number;
  /** Prize draws live (channel setting draws_enabled) — gates the account crown + entry-count badge. */
  drawsEnabled?: boolean;
  /** full: account + quote + cart with labels · compact: quote + cart icons · account: account button only */
  variant?: "full" | "compact" | "account";
}) {
  // This component renders THREE times per page (desktop, compact and account
  // variants for different breakpoints), so the panels themselves cannot live
  // here — per-instance state would stack two or three panels the moment the
  // open signal is shared. They live in <HeaderPanels />, rendered once outside
  // the header; these buttons only raise the signal.
  const { open } = useHeaderPanels();

  // Badges read the client counts (pushed by cart/quote mutations without any
  // route re-render); server props re-seed on any real route re-render. All
  // three HeaderClient instances share the one context, so they always agree.
  const { cartCount: ctxCartCount, quoteCount: ctxQuoteCount, seed } = useCartQuoteCounts();
  useEffect(() => {
    seed(serverCartCount, serverQuoteCount);
  }, [serverCartCount, serverQuoteCount, seed]);
  const cartCount = ctxCartCount ?? serverCartCount;
  const quoteCount = ctxQuoteCount ?? serverQuoteCount;

  const accountButton = (
    <button
      onClick={() => open("account")}
      className="inline-flex items-center gap-1.5 text-[13px] font-medium text-zinc-600 hover:text-[#D94B2B] transition-colors whitespace-nowrap"
      aria-label="Account"
    >
      {/* Prize-draw badge — dormant while draws_enabled is off; members then get
          the plain person icon. The "Account" vs "Sign In/Register" label below
          still keys off membership/session and is unaffected. */}
      {isMember && drawsEnabled ? (
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
  );

  if (variant === "account") {
    return accountButton;
  }

  if (variant === "compact") {
    return (
      <>
        <button
          onClick={() => open("quote")}
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
          onClick={() => open("cart")}
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
      </>
    );
  }

  return (
    <>
      {accountButton}

      {/* Quote */}
      <button
        onClick={() => open("quote")}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-zinc-600 hover:text-[#D94B2B] transition-colors whitespace-nowrap"
        aria-label="Open quote"
      >
        <LayoutGrid className="h-4 w-4" />
        Quote ({quoteCount})
      </button>

      {/* Cart */}
      <button
        onClick={() => open("cart")}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-zinc-600 hover:text-[#D94B2B] transition-colors whitespace-nowrap"
        aria-label="Open cart"
      >
        <ShoppingCart className="h-4 w-4" />
        Cart ({cartCount})
      </button>
    </>
  );
}
