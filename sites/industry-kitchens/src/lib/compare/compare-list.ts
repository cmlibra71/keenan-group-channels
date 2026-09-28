// ============================================================================
// Add to Compare — the visitor's compare list (IK parity plan decision 12,
// root cause `compare-feature`).
//
// WHAT THE OLD SITE DID (read off www.industrykitchens.com.au as a guest,
// 2026-09-28). Every product page and every category tile carried an "Add to
// Compare" link. Pressing it added the product to a per-session list (Magento's
// `catalog/product_compare/add`) and the link turned into "View Compare"; the
// product page also carried a "COMPARE PRODUCTS HERE" button. The list lived in
// the SESSION — a guest got one without an account and nothing was saved against
// them.
//
// HERE the list is a first-party COOKIE of product ids, newest first. A cookie
// rather than localStorage because the compare page is server-rendered: prices
// are per viewer (contract prices, catalogue scope) and must be resolved on the
// server, which can read a cookie and cannot read localStorage. Nothing is ever
// written to the database — for a guest or a signed-in shopper.
//
// PURE. No React, no next/headers — the client hook and the server page both
// parse the same value through here, so they cannot disagree about what the
// list holds (see compare-list.test.ts).
// ============================================================================

/** The cookie the list lives in. First-party, readable by the page's own script. */
export const COMPARE_COOKIE = "ik_compare";

/**
 * The most products the list holds. Magento sets no cap, but its compare page is
 * a popup window that scrolls sideways; a column wider than a phone per product
 * stops being a comparison well before ten. Adding past the cap drops the OLDEST
 * entry, so the button a shopper just pressed always works.
 */
export const MAX_COMPARE_ITEMS = 6;

/**
 * The largest id a product can have: `products.id` is a Postgres `integer` (int4). A larger
 * number in a hand-edited cookie would reach `WHERE id = ANY(...)` and fail the whole page
 * with "value out of range for type integer", so it is dropped here instead.
 */
export const MAX_PRODUCT_ID = 2147483647;

/** A usable product id: a whole number in 1..MAX_PRODUCT_ID. */
export function isProductId(id: number): boolean {
  return Number.isSafeInteger(id) && id > 0 && id <= MAX_PRODUCT_ID;
}

/** Thirty days: long enough to come back to, short enough not to haunt anyone. */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/**
 * The ids in a cookie value, newest first. Anything that is not a whole number in
 * 1..MAX_PRODUCT_ID (int4) is dropped, duplicates keep their first (newest) position, and the list
 * is cut to the cap — a hand-edited cookie cannot make the page read more.
 */
export function parseCompareList(value: string | null | undefined): number[] {
  if (!value) return [];
  let raw = value;
  try {
    raw = decodeURIComponent(value);
  } catch {
    // A malformed escape is read as-is; the digit filter below does the rest.
  }
  const out: number[] = [];
  for (const part of raw.split(/[,.\s]+/)) {
    if (!/^\d{1,10}$/.test(part)) continue;
    const id = Number(part);
    if (!isProductId(id) || out.includes(id)) continue;
    out.push(id);
    if (out.length >= MAX_COMPARE_ITEMS) break;
  }
  return out;
}

/** The list with `id` added at the front (moved there if already present), capped. */
export function addToCompareList(list: readonly number[], id: number): number[] {
  if (!isProductId(id)) return [...list];
  return [id, ...list.filter((x) => x !== id)].slice(0, MAX_COMPARE_ITEMS);
}

/** The list without `id`. */
export function removeFromCompareList(list: readonly number[], id: number): number[] {
  return list.filter((x) => x !== id);
}

/** The cookie VALUE for a list — comma-separated ids (no escaping needed). */
export function formatCompareList(list: readonly number[]): string {
  return list.join(",");
}

/**
 * The `document.cookie` assignment for a list. An empty list EXPIRES the cookie
 * rather than storing an empty one, so "Clear all" leaves nothing behind.
 */
export function serializeCompareCookie(list: readonly number[]): string {
  if (list.length === 0) return `${COMPARE_COOKIE}=; path=/; max-age=0; samesite=lax`;
  return `${COMPARE_COOKIE}=${formatCompareList(list)}; path=/; max-age=${MAX_AGE_SECONDS}; samesite=lax`;
}

/** The compare cookie's value out of a whole `document.cookie` string. */
export function readCompareCookie(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  for (const pair of cookieHeader.split(";")) {
    const eq = pair.indexOf("=");
    if (eq < 0) continue;
    if (pair.slice(0, eq).trim() === COMPARE_COOKIE) return pair.slice(eq + 1).trim();
  }
  return null;
}
