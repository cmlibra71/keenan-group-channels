"use server";

import { addToCart } from "@/lib/actions/cart";
import { addToQuote } from "@/lib/actions/quote";
import { loadBundle } from "@/lib/promotions/bundles";

/**
 * Add every component of a named bundle to the cart, in ONE click (card p6YVxc4P).
 *
 * The components go in as ordinary cart lines — the bundle is a promotion over
 * them, not a product of its own — so the reporting requirement holds by
 * construction: the order that follows carries the component SKUs with their own
 * quantities and prices, and the shared engine discounts them.
 *
 * The bundle is re-read from the database here and NEVER taken from the form: a
 * posted slug decides only WHICH bundle, never what is in it or what it costs.
 *
 * Partial failure is reported rather than hidden. If one component is refused
 * (staff switched it off for online ordering), the shopper is told which one, and
 * the rest stay in the cart — emptying their basket to punish one unavailable
 * line would be worse.
 */
export async function addBundleToCart(
  slug: string
): Promise<{ success?: true; error?: string; added?: number; cartCount?: number }> {
  const bundle = await loadBundle(slug).catch(() => null);
  if (!bundle) return { error: "That bundle is no longer available." };
  if (!bundle.addable) return { error: "That bundle is not available on this site right now." };

  const refused: string[] = [];
  let added = 0;
  let cartCount: number | undefined;
  for (const component of bundle.components) {
    if (component.productId == null) {
      refused.push(component.name);
      continue;
    }
    const result = await addToCart(component.productId, null, component.quantity);
    if (result && "error" in result && result.error) {
      refused.push(component.name);
      continue;
    }
    if (result && "cartCount" in result && typeof result.cartCount === "number") {
      cartCount = result.cartCount;
    }
    added++;
  }

  if (added === 0) return { error: "We couldn't add that bundle to your cart." };
  if (refused.length > 0) {
    return {
      success: true,
      added,
      ...(cartCount != null ? { cartCount } : {}),
      error: `${refused.join(", ")} couldn't be added — everything else is in your cart.`,
    };
  }
  return { success: true, added, ...(cartCount != null ? { cartCount } : {}) };
}

/** The same, onto the customer's quote request. */
export async function addBundleToQuote(
  slug: string
): Promise<{ success?: true; error?: string; added?: number; quoteCount?: number }> {
  const bundle = await loadBundle(slug).catch(() => null);
  if (!bundle) return { error: "That bundle is no longer available." };
  if (!bundle.addable) return { error: "That bundle is not available on this site right now." };

  const refused: string[] = [];
  let added = 0;
  let quoteCount: number | undefined;
  for (const component of bundle.components) {
    if (component.productId == null) {
      refused.push(component.name);
      continue;
    }
    // `addToQuote` adds one line per call; the quantity is set by repeating the
    // add, which is how the quote panel's own +/- works.
    let ok = true;
    for (let i = 0; i < component.quantity; i++) {
      const result = await addToQuote(component.productId, null, null, null);
      if (result && "error" in result && typeof result.error === "string") {
        ok = false;
        break;
      }
      if (result && "quoteCount" in result && typeof result.quoteCount === "number") {
        quoteCount = result.quoteCount;
      }
    }
    if (ok) added++;
    else refused.push(component.name);
  }

  if (added === 0) return { error: "We couldn't add that bundle to your quote." };
  if (refused.length > 0) {
    return {
      success: true,
      added,
      ...(quoteCount != null ? { quoteCount } : {}),
      error: `${refused.join(", ")} couldn't be added — everything else is on your quote.`,
    };
  }
  return { success: true, added, ...(quoteCount != null ? { quoteCount } : {}) };
}
