"use client";

import { createContext, useContext, useState, useCallback } from "react";

/**
 * Client-side cart/quote badge counts. Item-level cart/quote server actions
 * return the fresh count and callers push it here, so the header badges update
 * without re-rendering the whole route (the old revalidatePath/refresh()
 * "full reload"). `null` = not yet seeded — consumers fall back to the
 * server-rendered count props; HeaderClient re-seeds whenever the route
 * genuinely re-renders (hard load, submit/auth refresh flows), keeping the
 * server authoritative at those moments.
 */
type CartQuoteCountsValue = {
  cartCount: number | null;
  quoteCount: number | null;
  setCartCount: (n: number) => void;
  setQuoteCount: (n: number) => void;
  seed: (cart: number, quote: number) => void;
};

// Non-throwing no-op default: AddToCart/AddToQuote also render on the
// provider-less /render/* CMS surface, where count pushes must silently no-op.
const CartQuoteCountsContext = createContext<CartQuoteCountsValue>({
  cartCount: null,
  quoteCount: null,
  setCartCount: () => {},
  setQuoteCount: () => {},
  seed: () => {},
});

export function CartQuoteCountsProvider({ children }: { children: React.ReactNode }) {
  const [counts, setCounts] = useState<{ cartCount: number | null; quoteCount: number | null }>({
    cartCount: null,
    quoteCount: null,
  });
  const setCartCount = useCallback(
    (n: number) => setCounts((c) => ({ ...c, cartCount: n })),
    []
  );
  const setQuoteCount = useCallback(
    (n: number) => setCounts((c) => ({ ...c, quoteCount: n })),
    []
  );
  const seed = useCallback(
    (cart: number, quote: number) => setCounts({ cartCount: cart, quoteCount: quote }),
    []
  );
  return (
    <CartQuoteCountsContext.Provider value={{ ...counts, setCartCount, setQuoteCount, seed }}>
      {children}
    </CartQuoteCountsContext.Provider>
  );
}

export function useCartQuoteCounts() {
  return useContext(CartQuoteCountsContext);
}
