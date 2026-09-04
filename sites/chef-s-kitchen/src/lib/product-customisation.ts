// ============================================================================
// ONE definition of "has this shopper answered what this product asks?" — used
// by BOTH buy actions (`addToCart`, `addToQuote`), because a refusal that only
// one of them makes is not a refusal.
//
// THE ARGUMENT MAY BE ABSENT, AND THAT IS THE WHOLE POINT OF THIS FILE.
// `addToCart(productId, variantId, quantity)` and `addToQuote(productId, null)`
// are live call shapes: a listing tile, a related-products rail and the authored
// `product-card` master all press the buy button with the product id alone and no
// configuration at all. The live Chefs Depot product page ships exactly such an
// `add-to-quote` master, and Custom Stainless Steel — the quote-only product
// whose whole reason for existing is that the customer must say what they want
// built — sits in those rails.
//
// The register rule that governs this is 7vu2iEEZ's, on `sf-catalog-browse` and
// `sf-product-page`: "a tile does NOT know about the per-product buying controls
// — the CART is what refuses… a listing tile still offers the button, and
// clicking it returns a plain refusal." Treating a missing argument as "nothing
// to check" broke that rule in the worst direction: the tile did not get refused,
// it SUCCEEDED, and the rep received a bare line with no instructions on it.
//
// A missing argument is NOT the same as an emptied box, and only the refusal is
// shared here. What a cleared panel does to a line the customer already has is
// the caller's business (see `addToQuote`); this module only ever answers "may
// this be bought as it stands, and if not, what do we say?".
// ============================================================================

import {
  unansweredAddonGroups,
  type AddonSelectionInput,
  type ProductAddons,
} from "@keenan/services/product-addons";

/** Where the shopper was heading, which is all that changes in the wording. */
export type CustomisationDestination = "cart" | "quote";

/**
 * The sentence to refuse with, or null when there is nothing to refuse.
 *
 * `selection` is `undefined` when the renderer offered no panel — a tile or a
 * rail. The check still runs; only the wording changes, because naming a box
 * that is not on the screen sends a shopper hunting for it.
 */
export function customisationRefusal(
  addons: ProductAddons | null,
  selection: AddonSelectionInput | null | undefined,
  destination: CustomisationDestination
): string | null {
  const unanswered = unansweredAddonGroups(addons, selection ?? null);
  if (unanswered.length === 0) return null;
  const missing = unanswered.join(" and ");
  const where = destination === "cart" ? "cart" : "quote";
  return selection === undefined
    ? `Please open the product page and fill in ${missing} before adding this to your ${where}.`
    : `Please fill in ${missing} before adding this to your ${where}.`;
}
