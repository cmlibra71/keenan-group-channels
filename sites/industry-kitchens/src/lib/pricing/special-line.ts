// A cart line's PARTNER SPECIAL marker, and when the line must be re-priced because of it
// (card tJ4audbu).
//
// Cart lines store their price at ADD time and a cart lives for 30 days (`CART_MAX_AGE`). A special
// is dated, and "it ends by itself on the date set" is the card's headline — so a line priced by a
// special that has since ended must stop carrying it, and a line added BEFORE a special started
// must take it once it runs, or the page advertises one price and the cart charges another.
//
// The price alone cannot say which lines a special priced (a special can equal a catalogue price),
// so the line says so itself: `cart_items.applied_coupons` carries
// `{ partner_special: <promotion id>, price_ex_tax: <the locked price> }` beside anything else in
// that array (a Buy X Get Y reward line's `{ promotion_reward }`, card EIXdjw2s, is left alone).
// The price is kept too, so an approved EDIT to a running special's price re-prices the line.
//
// Pure and import-free: the cart read, the checkout and the tests share it.

export type SpecialLineMarker = { partner_special: number; price_ex_tax: number };

/** The special that priced this line, from its `applied_coupons`, or null. */
export function specialMarkerOf(applied: unknown): SpecialLineMarker | null {
  if (!Array.isArray(applied)) return null;
  for (const entry of applied) {
    if (!entry || typeof entry !== "object") continue;
    const id = Number((entry as { partner_special?: unknown }).partner_special);
    const price = Number((entry as { price_ex_tax?: unknown }).price_ex_tax);
    if (Number.isInteger(id) && id > 0 && Number.isFinite(price)) {
      return { partner_special: id, price_ex_tax: price };
    }
  }
  return null;
}

/** Is this a promotion's REWARD line (card EIXdjw2s)? Those move with their offer, never here. */
export function isRewardLine(applied: unknown): boolean {
  if (!Array.isArray(applied)) return false;
  return applied.some((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const id = Number((entry as { promotion_reward?: unknown }).promotion_reward);
    return Number.isInteger(id) && id > 0;
  });
}

/**
 * The `applied_coupons` value to store for a line just priced: every entry that is not ours kept,
 * the special's marker replaced (or removed when no special priced it).
 */
export function withSpecialMarker(
  applied: unknown,
  special: { promotionId: number; priceExTax: number } | null | undefined
): unknown[] {
  const others = Array.isArray(applied)
    ? applied.filter(
        (entry) => !(entry && typeof entry === "object" && "partner_special" in (entry as object))
      )
    : [];
  return special
    ? [...others, { partner_special: special.promotionId, price_ex_tax: special.priceExTax }]
    : others;
}

/**
 * Must this line be re-priced because a special started, ended or changed since it was priced?
 *
 *  - no marker, no live special: untouched — the ordinary "frozen at add time" line.
 *  - no marker, a live special: it was added before the special started (or before this rule
 *    shipped) — it takes the special now, as the page advertises.
 *  - a marker, no live special: the special ended, was switched off or was withdrawn — it goes
 *    back to the price it would have without one.
 *  - a marker naming a different special or a different price: re-priced to the live one.
 */
export function specialLineIsStale(
  applied: unknown,
  live: { promotionId: number; priceExTax: number } | null | undefined
): boolean {
  if (isRewardLine(applied)) return false;
  const marker = specialMarkerOf(applied);
  if (!marker) return live != null;
  if (!live) return true;
  return marker.partner_special !== live.promotionId || Math.abs(marker.price_ex_tax - live.priceExTax) > 0.0001;
}

/** The sentence `placeOrder` stops on when a special moved a line's price since the cart was shown. */
export const SPECIAL_PRICES_MOVED =
  "A Partner Special on an item in your cart has started or ended, so its price has changed. Please review your cart and try again.";
