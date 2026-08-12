"use client";

import { createContext, useContext, useState, useCallback, useMemo } from "react";

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

/** The header slide-out panels, which are mutually exclusive — only one shows. */
export type HeaderPanelKind = "cart" | "quote" | "account";

/**
 * Which header panel is open, held ABOVE the header so exactly one panel host
 * responds no matter how many HeaderClient instances a site renders (Industry
 * Kitchens renders three — desktop, compact and account — and stacked panels
 * would be the result of per-instance state). Add-to-cart / add-to-quote call
 * `open()` on success so the panel pops out showing what was just added.
 *
 * `nonce` bumps on every open() — panel hosts key their contents on it so a
 * repeat add re-reads the cart/quote even when the panel is already open,
 * without closing and re-animating it.
 */
type HeaderPanelsValue = {
  panel: HeaderPanelKind | null;
  nonce: number;
  intent: HeaderPanelIntent | null;
  open: (panel: HeaderPanelKind, intent?: HeaderPanelIntent) => void;
  close: () => void;
};

/**
 * What the opener wants the panel to do — carried alongside the open signal so a
 * caller elsewhere in the tree (the cart drawer, the checkout form) can send the
 * shopper into the account panel on the right tab, with the email they already
 * typed, and say where they should land afterwards.
 *
 * `returnTo` is the "revert to the order" behaviour: "close" drops the overlay so
 * the page behind it (checkout) is right there, freshly re-rendered with the new
 * session; a panel kind re-opens that panel (the cart drawer re-reads itself, so
 * the shopper sees their now account-priced basket).
 */
export type HeaderPanelIntent = {
  /** Which face of the account panel to show: sign in, or create an account. */
  view?: "login" | "register";
  /** Pre-fill the email the shopper already typed, so they don't retype it. */
  email?: string;
  /** Where to send them once they are signed in. Omitted = stay in the panel. */
  returnTo?: HeaderPanelKind | "close";
};

// Same non-throwing no-op default, for the same reason as the counts above:
// the add buttons also render on the provider-less /render/* CMS surface,
// which has no header and no panels, so opening one must silently no-op.
const HeaderPanelsContext = createContext<HeaderPanelsValue>({
  panel: null,
  nonce: 0,
  intent: null,
  open: () => {},
  close: () => {},
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
  const countsValue = useMemo(
    () => ({ ...counts, setCartCount, setQuoteCount, seed }),
    [counts, setCartCount, setQuoteCount, seed]
  );
  // Panel visibility lives in a SEPARATE context nested inside this one: every
  // layout already wraps both the header and the page in this provider, so the
  // panels need no layout change, and keeping the two values apart means a
  // panel opening does not re-render every badge consumer (or vice versa).
  return (
    <CartQuoteCountsContext.Provider value={countsValue}>
      <HeaderPanelsProvider>{children}</HeaderPanelsProvider>
    </CartQuoteCountsContext.Provider>
  );
}

function HeaderPanelsProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{
    panel: HeaderPanelKind | null;
    nonce: number;
    intent: HeaderPanelIntent | null;
  }>({
    panel: null,
    nonce: 0,
    intent: null,
  });
  const open = useCallback(
    (panel: HeaderPanelKind, intent?: HeaderPanelIntent) =>
      setState((s) => ({ panel, nonce: s.nonce + 1, intent: intent ?? null })),
    []
  );
  const close = useCallback(() => setState((s) => ({ ...s, panel: null })), []);
  const value = useMemo(() => ({ ...state, open, close }), [state, open, close]);
  return <HeaderPanelsContext.Provider value={value}>{children}</HeaderPanelsContext.Provider>;
}

export function useCartQuoteCounts() {
  return useContext(CartQuoteCountsContext);
}

export function useHeaderPanels() {
  return useContext(HeaderPanelsContext);
}
