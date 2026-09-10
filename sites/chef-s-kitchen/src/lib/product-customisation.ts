// ============================================================================
// THE FREE-TEXT HALF of a product's customisation — card kyMjCmAw.
//
// `products.metafields.addons` is ONE bag holding two features (see
// `lib/product/addon-panel.ts`, which declares the split): checkbox / radio /
// dropdown are 0CDcCYmO's priced extras, `text` is the Instructions box the
// shopper types into on Custom Stainless Steel. They share the model, the
// resolver, the cart's configuration key, the order snapshot and the quote note
// deliberately, so an answer travels with whichever buy button is pressed
// whatever control produced it.
//
// What they do NOT share is the WORDS of a refusal, which is what this file is
// for. "Please choose Feed hopper" is right for a radio group and wrong for a
// box you write a sentence in, and both sentences reach a customer.
//
// THE REFUSAL RUNS WHETHER OR NOT A PANEL WAS OFFERED.
// `addToCart(productId, variantId, quantity)` and `addToQuote(productId, null)`
// are live call shapes: a listing tile, a related-products rail and the authored
// `product-card` master all press the buy button with the product id alone and no
// configuration at all. The live Chefs Depot product page ships exactly such an
// `add-to-quote` master, and Custom Stainless Steel — the quote-only product
// whose whole reason for existing is that the customer must say what they want
// built — sits in those rails. 7vu2iEEZ's rule on `sf-catalog-browse` and
// `sf-product-page` is the one that governs it: "a listing tile still offers the
// button, and clicking it returns a plain refusal." Treating a missing argument
// as "nothing to check" broke that rule in the worst direction — the tile was not
// refused, it SUCCEEDED, and the rep received a bare line with no instructions.
//
// A missing argument is NOT the same as an emptied box, and only the refusal is
// decided here. What a cleared panel does to a line the customer already has
// belongs to `lib/quotes/addon-line-write.ts`.
// ============================================================================

import {
  unansweredAddonGroups,
  type AddonSelectionInput,
  type ProductAddons,
} from "@keenan/services/product-addons";

/** Where the shopper was heading, which is all that changes in the wording. */
export type CustomisationDestination = "cart" | "quote";

/**
 * The sentence to refuse a missing TYPED answer with, or null when there is
 * nothing to refuse. Call it with the free-text definition alone
 * (`customisationGroups`), so the wording always fits the control.
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
  return selection === undefined || selection === null
    ? `Please open the product page and fill in ${missing} before adding this to your ${where}.`
    : `Please fill in ${missing} before adding this to your ${where}.`;
}

/**
 * IS THERE A BUY AREA AT ALL to fill this field in for?
 *
 * 7vu2iEEZ's rule on `sf-product-page`: a product with BOTH `restrict_add_to_cart`
 * and `restrict_add_to_quote` renders no buy area — no control and no wording.
 * A customisation panel above it would then be a box marked Required with nothing
 * to press, which is the one shape that page is not allowed to take. Named here
 * rather than repeated as `a && b` in each renderer, so the three that draw the
 * panel cannot drift apart on it.
 *
 * No live product carries either flag today; this keeps the first one that does
 * from arriving as a bug report.
 */
export function buyAreaSuppressed(
  restrictAddToCart: boolean | null | undefined,
  restrictAddToQuote: boolean | null | undefined
): boolean {
  return restrictAddToCart === true && restrictAddToQuote === true;
}
