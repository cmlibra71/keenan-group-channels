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

/**
 * DID THIS PRESS RE-CONFIGURE THE LINE THE CUSTOMER ALREADY HAS, or is it a
 * second one of the same thing?
 *
 * A re-configure holds the quantity where it is; anything else counts up. The
 * distinction matters because a custom fabrication is not a countable stock item:
 * a shopper who changes "1200mm bench" to "800mm bench" and presses the button
 * again is correcting the request, not ordering a second bench, and stacking
 * would leave the rep one line at quantity 2 carrying only the newer
 * measurements.
 *
 * IT IS A PURE FUNCTION BECAUSE THE INLINE VERSION WAS WRONG IN A WAY NO TEST
 * COULD SEE. It read, in effect, "(a bundle, or an answer, or a cleared panel)
 * AND the note changed", with the note compared as `null !== ""`. On a product
 * carrying ANY authored group with the box left empty — an author may untick
 * Required — a shopper's SECOND press resolved nothing (`clearedPanel`), wrote
 * `null` where an absent note reads back as `""`, and so counted as a
 * re-configure: the quantity silently stayed at 1, the panel re-opened, the count
 * did not move and nothing on the screen explained it. Worse on a line a REP had
 * commented on, where the prior note is the rep's own text and therefore differs
 * on EVERY press, so the customer could never raise the quantity from the
 * storefront again. The cart never had the bug (an empty configuration keys the
 * same as no configuration, so it matched and incremented), which left the two
 * surfaces disagreeing about the same click.
 *
 * The two rules that fix it, and the two directions to verify:
 *  - a CLEAR-DOWN is a re-configure on its own, no note comparison — but only
 *    when the line actually CARRIED a configuration to withdraw. "Nothing was
 *    answered" is a fact about the REQUEST; "there was something to clear" is a
 *    fact about the LINE, and treating the first as the second turned "never
 *    answered" into "the shopper withdrew their answer".
 *  - every note comparison is normalised, so an absent note and an empty one are
 *    the same note.
 */
export interface QuoteLineReconfigure {
  /** A bundle press always REPLACES the captured configuration (card 7bmpuqei). */
  isBundle: boolean;
  /** How many customisation answers THIS press resolved against the product. */
  answeredCount: number;
  /** The panel was offered, the product has groups, and nothing came back. */
  clearedPanel: boolean;
  /** Does the line the customer already has actually carry a configuration? */
  lineWasConfigured: boolean;
  /** The note this press would write. */
  note: string | null;
  /** The note the storefront wrote last time (`priorStorefrontNote`). */
  priorNote: string | null;
}

export function quoteLineReconfigured(input: QuoteLineReconfigure): boolean {
  if (input.clearedPanel) return input.lineWasConfigured;
  if (!input.isBundle && input.answeredCount === 0) return false;
  return (input.note ?? "") !== (input.priorNote ?? "");
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
