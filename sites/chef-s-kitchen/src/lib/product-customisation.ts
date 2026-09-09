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

/**
 * MAY THE STOREFRONT WRITE THIS QUOTE LINE'S COMMENT?
 *
 * 7bmpuqei's rule on `quote-editor`: the storefront writes the line's Comment only
 * when the line has none, or when what is on it is the note the storefront itself
 * wrote last time — a comment a REP typed is never overwritten, because it is
 * customer-visible on the quote link.
 *
 * Custom Stainless Steel is the exact workflow that rule protects. The customer
 * describes a fabrication, the rep annotates and prices it in the line's Comment,
 * and the customer then presses Add to Quote again with a corrected measurement.
 * Writing unconditionally would replace the rep's pricing note with the customer's
 * own sentence, on a quote the customer is already reading.
 *
 * `attributes.addon_note` is the ownership marker: the exact string the storefront
 * last wrote on this line. Lines written before it existed carry none, so a line
 * the storefront demonstrably CONFIGURED — it carries an `addon_selection` or a
 * `kit_kind` — is still read as ours, and anything else is treated as a rep's.
 *
 * The STRUCTURED record (`addon_selection`) is written either way; only the
 * customer-visible sentence is held back. A rep who has taken the Comment keeps
 * it, and can still read what the customer last asked for.
 */
export function storefrontOwnsLineComment(
  comment: string | null | undefined,
  attributes: Record<string, unknown> | null | undefined
): boolean {
  if ((comment ?? "").trim() === "") return true;
  const bag = attributes ?? {};
  const marker = typeof bag.addon_note === "string" ? bag.addon_note : null;
  if (marker !== null) return comment === marker;
  return bag.addon_selection != null || bag.kit_kind != null;
}

/** The note the storefront last wrote on this line, for deciding whether the
 *  configuration actually CHANGED. Measured against our own note rather than
 *  against whatever is on the line now: a rep having typed over the Comment must
 *  not turn a correction into a second unit. */
export function priorStorefrontNote(
  comment: string | null | undefined,
  attributes: Record<string, unknown> | null | undefined
): string {
  const bag = attributes ?? {};
  if (typeof bag.addon_note === "string") return bag.addon_note;
  return comment ?? "";
}
