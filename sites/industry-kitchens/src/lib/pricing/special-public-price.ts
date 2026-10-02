// The two PUBLIC places a Partner Special's price must follow the page (card tJ4audbu), outside the
// tile/page funnel (`lib/member.ts` `applyAccountPrices` -> `applySpecialPrices`):
//
//  1. the header search dropdown (`/api/search`) — a suggestion quotes the price the product's own
//     tile and page quote this viewer (the #323 rule on sf-catalog-browse). The route lays the
//     special over its hits with the same services overlay; the overlay writes 2dp STRINGS, while
//     both dropdowns compare `salePrice < price` and format numbers, so a special hit is turned back
//     into numbers here ("999.00" < "1200.00" is false as text, which would drop the sale figure).
//  2. the product page's structured data (JSON-LD Offer) — Google's automatic item updates read the
//     page markup's `price` and can override the feed, so the Offer states the special, and says
//     until when (`priceValidUntil`, the special's last Melbourne day).
//
// Pure and import-free.

/** The tag `applySpecialPrices` leaves on a row carrying a live special (services `SpecialTag`). */
export type PublicSpecialTag = {
  priceExTax: number;
  endsOn: string | null;
};

/** The live special a row was overlaid with, or null. Tolerates any shape (any catalogue row). */
export function specialTagOfRow(row: unknown): PublicSpecialTag | null {
  if (!row || typeof row !== "object") return null;
  const tag = (row as { special?: unknown }).special as { priceExTax?: unknown; endsOn?: unknown } | null | undefined;
  if (!tag || typeof tag !== "object") return null;
  const price = Number(tag.priceExTax);
  if (!Number.isFinite(price) || price <= 0) return null;
  const endsOn = typeof tag.endsOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(tag.endsOn) ? tag.endsOn : null;
  return { priceExTax: price, endsOn };
}

function toNumberOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}

/**
 * A search hit after the special overlay, with `price` / `salePrice` back as numbers (the
 * dropdowns' `SuggestionHit` contract). Hits with no special are returned untouched, by identity.
 */
export function numericSpecialHit<T extends { price?: unknown; salePrice?: unknown }>(hit: T): T {
  if (!specialTagOfRow(hit)) return hit;
  return {
    ...hit,
    price: toNumberOrNull(hit.price) ?? 0,
    salePrice: toNumberOrNull(hit.salePrice),
  };
}

/**
 * The ex-GST figure a product page's JSON-LD Offer states, and the date it holds until. A live
 * special IS that figure for every viewer (it is locked: no member, group, bulk or contract price
 * goes under it), so it wins over `fallbackEx`, the price the page would otherwise state.
 */
export function offerPriceWithSpecial(
  row: unknown,
  fallbackEx: number
): { priceEx: number; priceValidUntil: string | null } {
  const special = specialTagOfRow(row);
  if (special) return { priceEx: special.priceExTax, priceValidUntil: special.endsOn };
  return { priceEx: fallbackEx, priceValidUntil: null };
}
