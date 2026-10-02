// ============================================================================
// "ADD TO WISHLIST" BY A GUEST — kept until they have signed in (Magento parity: a signed-out
// shopper who clicks Add to Wishlist is sent to sign in, and the product is added once they have).
//
// The add action, finding no session, stores WHAT was asked for in a short-lived httpOnly cookie
// and sends the shopper to the sign-in panel with `/account/wishlist` as the destination. The
// wishlist page, once signed in, claims it (a server action — never a GET side effect) and adds it.
// The cookie carries no authority: it is only a product id, a variant id and a quantity, and the
// claim re-validates all three exactly as a fresh add would.
//
// Pure: no Next imports — unit-tested.
// ============================================================================

export const WISHLIST_PENDING_COOKIE = "kg_wishlist_pending";
/** Long enough to sign in (or register) and come back; short enough not to surprise anyone later. */
export const WISHLIST_PENDING_MAX_AGE_SECONDS = 30 * 60;

export interface PendingWishlistAdd {
  productId: number;
  variantId: number | null;
  quantity: number;
}

const ID = /^[1-9][0-9]{0,9}$/;

function id(value: unknown): number | null {
  const s = typeof value === "number" ? String(value) : value;
  if (typeof s !== "string" || !ID.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n <= 2_147_483_647 ? n : null;
}

/** `p<product>.v<variant|0>.q<quantity>` — null when any part is unusable. */
export function encodePendingWishlistAdd(add: PendingWishlistAdd): string | null {
  const p = id(add.productId);
  const v = add.variantId == null ? 0 : id(add.variantId);
  const q = id(add.quantity);
  if (p === null || v === null || q === null || q > 9999) return null;
  return `p${p}.v${v}.q${q}`;
}

/** The cookie back into an add, or null for anything that is not exactly what we write. */
export function decodePendingWishlistAdd(raw: unknown): PendingWishlistAdd | null {
  if (typeof raw !== "string" || raw.length > 40) return null;
  const m = /^p([0-9]+)\.v([0-9]+)\.q([0-9]+)$/.exec(raw);
  if (!m) return null;
  const productId = id(m[1]);
  const variantId = m[2] === "0" ? null : id(m[2]);
  const quantity = id(m[3]);
  if (productId === null || quantity === null || quantity > 9999) return null;
  if (m[2] !== "0" && variantId === null) return null;
  return { productId, variantId, quantity };
}

/** `?added=<item id>` on the wishlist page — the line the page announces, or null. */
export function parseAddedParam(value: unknown): number | null {
  const v = Array.isArray(value) ? value[0] : value;
  return id(v);
}
