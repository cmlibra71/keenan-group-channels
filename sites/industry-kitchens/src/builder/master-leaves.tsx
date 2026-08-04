"use client";
import { addToCart } from "@/lib/actions/cart";
import { addToQuote } from "@/lib/actions/quote";
import { useCartQuoteCounts, useHeaderPanels } from "@/lib/cart-quote-counts";
import { trackAddedToCart } from "@/components/analytics/klaviyo";
import { ga4SelectItem, ga4AddToCart } from "@/components/analytics/ga4";
import type { NativeComponents } from "@keenan/services/builder-react";

// ============================================================================
// The sealed native LEAVES the component masters place — the only app-tier
// widgets a master contains. Everything around them is authored tree.
// stats-banner, add-to-cart, add-to-quote and price-block are component MASTERS now
// (component-seeds): add-to-cart is an authored two-button tree whose cart POST
// + Klaviyo/GA4 analytics + header badge run through the registered `addToCart`
// Action (useAddToCartHandler below); add-to-quote is an authored button whose
// quote POST + header badge run through the `addToQuote` Action
// (useAddToQuoteHandler below); price-block's GST-reactivity is data
// (context.gst overlaid by the wrappers + dual ex/inc label facts). Natives
// win over same-key masters, so none of them may be registered here.
// Register masterLeafNatives() + the addToCart/addToQuote handlers in every
// Builder*Page wrapper whose trees can contain product cards / the hero panel.
// ============================================================================

const num = (v: unknown): number | null => {
  const x = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(x) ? x : null;
};
const strOr = (v: unknown): string | undefined => (v == null || v === "" ? undefined : String(v));

export function masterLeafNatives(): NativeComponents {
  // stats-banner is a component MASTER now (exploded in component-seeds); natives
  // win over same-key masters, so it must NOT be registered here. No sealed
  // leaves remain — masters carry only authored trees + the add-to-cart/quote
  // Actions registered per wrapper.
  return {};
}

/** GA4 select_item Action the product-card master's links run (parity with the
 *  native card's handleSelect — non-blocking, navigation proceeds). */
export function selectItemHandler(listId?: string, listName?: string) {
  return (args: Record<string, unknown>) => {
    ga4SelectItem(
      {
        item_id: strOr(args.sku) ?? String(args.id ?? ""),
        item_name: String(args.name ?? ""),
        item_brand: strOr(args.brand),
        price: num(args.price) ?? undefined,
        quantity: 1,
      },
      listId,
      listName
    );
    return { success: true };
  };
}

export function enquireHandler(router: { push: (to: string) => void }) {
  return (args: Record<string, unknown>) => {
    const pid = args?.product_id ?? "";
    // The enquiry form is the CMS page /pages/contact — there is no /contact
    // route, so the old path 404'd every Enquire button on the site.
    router.push(`/pages/contact?product=${pid}`);
    return { success: true };
  };
}

/** The `addToCart` Action the add-to-cart MASTER runs — a faithful port of
 *  AddToCartButton.tsx's handleClick: cart POST → header badge update → BOTH
 *  Klaviyo `Added to Cart` and GA4 `add_to_cart` fired unconditionally (exactly
 *  as the live button does, even on an addToCart error). addToCart returns
 *  `{ error }` WITHOUT a success key on failure, which BuilderActions.run would
 *  treat as ok — so we normalise to `{ success:false, error }` so the master's
 *  onError branch (reset the pending state) fires. */
export function useAddToCartHandler() {
  const { setCartCount } = useCartQuoteCounts();
  const { open } = useHeaderPanels();
  return async (args: Record<string, unknown>) => {
    const id = num(args.productId);
    if (id == null) return { success: false, error: "no product" };
    const res = await addToCart(id, undefined, 1);
    // Fresh count from the action → badge updates without a route re-render,
    // and the cart panel pops out showing what was just added — parity with
    // AddToCartButton, which does exactly this in the same success branch.
    if (res && "cartCount" in res && typeof res.cartCount === "number") {
      setCartCount(res.cartCount);
      open("cart");
    }
    // Fire client-side so browse/cart-abandonment flows see it (server actions can't).
    trackAddedToCart({
      id,
      sku: strOr(args.sku) ?? null,
      name: strOr(args.name) ?? `Product ${id}`,
      price: num(args.price) ?? null,
      quantity: 1,
    });
    ga4AddToCart({
      item_id: strOr(args.sku) ?? String(id),
      item_name: strOr(args.name) ?? `Product ${id}`,
      item_brand: strOr(args.brand),
      item_category: strOr(args.category),
      price: num(args.price) ?? undefined,
      quantity: 1,
    });
    return "error" in (res ?? {})
      ? { success: false, error: String((res as { error: string }).error) }
      : { success: true };
  };
}

/** The `addToQuote` Action the add-to-quote MASTER runs — a faithful port of
 *  AddToQuoteButton.tsx's handleClick: quote POST → header badge update. Like
 *  addToCart, the action returns `{ error }` WITHOUT a success key on failure,
 *  which BuilderActions.run would treat as ok — so we normalise to
 *  `{ success:false, error }` so the master's onError toast fires. */
export function useAddToQuoteHandler() {
  const { setQuoteCount } = useCartQuoteCounts();
  const { open } = useHeaderPanels();
  return async (args: Record<string, unknown>) => {
    const id = num(args.productId);
    if (id == null) return { success: false, error: "no product" };
    const res = await addToQuote(id, null);
    // Fresh count from the action → badge updates without a route re-render,
    // and the quote panel pops out — parity with AddToQuoteButton.
    if (res && "quoteCount" in res && typeof res.quoteCount === "number") {
      setQuoteCount(res.quoteCount);
      open("quote");
    }
    return "error" in (res ?? {})
      ? { success: false, error: String((res as { error: string }).error) }
      : { success: true };
  };
}
