"use server";

import { cookies } from "next/headers";
import {
  addWishlistLine,
  parseWishlistId,
  removeWishlistLine,
  updateWishlistLines,
  wishlistProductCheck,
  type WishlistLine,
  type WishlistLineUpdate,
} from "@keenan/services";
import { CHANNEL_ID, getFeatureFlag } from "@/lib/store";
import { getSession } from "@/lib/auth";
import { enforceLimit } from "@/lib/security/rate-limits";
import { applyCatalogScopeBy, isProductVisibleToViewer, RESTRICTED_PRODUCT_ERROR } from "@/lib/catalog-scope";
import { signInRedirect } from "@/lib/account-redirect";
import {
  WISHLIST_PENDING_COOKIE,
  WISHLIST_PENDING_MAX_AGE_SECONDS,
  decodePendingWishlistAdd,
  encodePendingWishlistAdd,
} from "@/lib/wishlist/pending-add";

// ============================================================================
// THE WISHLIST'S SERVER ACTIONS (Industry Kitchens, 2026-10-02).
//
// WHOSE LIST. Always the signed-in contact from the session cookie (channel-bound, HMAC-signed —
// `lib/auth.ts`), on THIS channel (`CHANNEL_ID`). No action takes a contact, a wishlist id or a
// channel from the caller; an item id from the caller only ever matches inside the caller's own
// list (services `storefrontWishlist.ts` puts the owner in every statement).
//
// SWITCHED OFF = INERT. Every action first reads the channel setting `wishlist_enabled` (absent =
// off) and refuses without touching the database when it is off — Chefs Depot.
//
// WHAT MAY BE ADDED. A product this channel shows (services) AND this viewer may see (the
// storefront's catalogue chokepoint — account-exclusive products), so a hidden product can never
// be wishlisted by poking the action directly.
//
// RATE-LIMITED by the `wishlist` policy, keyed by the contact (`c<id>`) and the caller's IP.
//
// A GUEST who adds is sent to sign in; the request waits in a short-lived httpOnly cookie
// (`lib/wishlist/pending-add.ts`) and the wishlist page claims it after sign-in (Magento parity).
// ============================================================================

const WISHLIST_FLAG = "wishlist_enabled";
const DESTINATION = "/account/wishlist";

const UNAVAILABLE = "The wishlist is not available.";
const INVALID = "That request could not be understood. Please refresh the page and try again.";
const PRODUCT_GONE = "This product is no longer available.";
const VARIANT_MISMATCH = "Please choose the product's options again and retry.";
const LIST_FULL = "Your wishlist is full. Please remove something before adding more.";
const NOT_FOUND = "That item is no longer in your wishlist. Please refresh the page.";

export type AddToWishlistResult =
  | { ok: true; itemId: number; count: number; redirect: string }
  | { ok: false; error: string; signIn?: string };

export type ClaimWishlistResult =
  | { ok: true; added: WishlistLine | null; count: number | null }
  | { ok: false; error: string };

export type UpdateWishlistResult =
  | { ok: true; items: WishlistLine[]; removed_ids: number[]; count: number }
  | { ok: false; error: string };

export type RemoveFromWishlistResult = { ok: true; removed: boolean; count: number } | { ok: false; error: string };

async function enabled(): Promise<boolean> {
  return getFeatureFlag(WISHLIST_FLAG).catch(() => false);
}

async function limited(contactId: number | null, surface: string): Promise<string | null> {
  const decision = await enforceLimit("wishlist", {
    identifier: contactId ? `c${contactId}` : null,
    surface,
    identifierIsEmail: false,
  });
  return decision.allowed ? null : decision.message;
}

function addRefusal(reason: "product_unavailable" | "variant_mismatch" | "list_full" | "invalid"): string {
  if (reason === "product_unavailable") return PRODUCT_GONE;
  if (reason === "variant_mismatch") return VARIANT_MISMATCH;
  if (reason === "list_full") return LIST_FULL;
  return INVALID;
}

/** The lines this viewer may see — the storefront's catalogue scope over the owner's own lines. */
async function scoped(lines: WishlistLine[]): Promise<WishlistLine[]> {
  return applyCatalogScopeBy(lines, (l) => l.product_id);
}

/**
 * "Add to Wishlist". Signed in: adds (or grows the existing line) and hands back the wishlist page
 * to go to, announcing the line. Signed out: keeps the request and hands back the sign-in panel.
 */
export async function addToWishlist(
  productId: number,
  variantId?: number | null,
  quantity?: number | null
): Promise<AddToWishlistResult> {
  if (!(await enabled())) return { ok: false, error: UNAVAILABLE };
  const session = await getSession();
  const tooMany = await limited(session?.contactId ?? null, "wishlist.add");
  if (tooMany) return { ok: false, error: tooMany };

  const pid = parseWishlistId(productId);
  const vid = variantId == null ? null : parseWishlistId(variantId);
  if (pid === null || (variantId != null && vid === null)) return { ok: false, error: INVALID };
  if (!(await isProductVisibleToViewer(pid))) return { ok: false, error: RESTRICTED_PRODUCT_ERROR };

  if (!session) {
    // Only a request we would accept is kept, so the claim after sign-in rarely has to refuse.
    const check = await wishlistProductCheck(CHANNEL_ID, pid, vid);
    if (check !== "ok") return { ok: false, error: addRefusal(check) };
    const raw = encodePendingWishlistAdd({ productId: pid, variantId: vid, quantity: quantity ?? 1 });
    if (!raw) return { ok: false, error: INVALID };
    (await cookies()).set(WISHLIST_PENDING_COOKIE, raw, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: WISHLIST_PENDING_MAX_AGE_SECONDS,
    });
    return { ok: false, error: "sign_in_required", signIn: signInRedirect(DESTINATION) };
  }

  const result = await addWishlistLine(
    { contactId: session.contactId, channelId: CHANNEL_ID },
    { productId: pid, variantId: vid, quantity: quantity ?? 1 }
  );
  if (!result.ok) return { ok: false, error: addRefusal(result.reason) };
  return { ok: true, itemId: result.item.id, count: result.count, redirect: `${DESTINATION}?added=${result.item.id}` };
}

/**
 * The add a guest asked for before signing in, made now that they have. Called once by the
 * wishlist page on mount (a POST, never a GET side effect). Nothing pending = `added: null`.
 */
export async function claimPendingWishlistAdd(): Promise<ClaimWishlistResult> {
  if (!(await enabled())) return { ok: false, error: UNAVAILABLE };
  const session = await getSession();
  if (!session) return { ok: false, error: "sign_in_required" };
  const jar = await cookies();
  const raw = jar.get(WISHLIST_PENDING_COOKIE)?.value;
  if (raw === undefined) return { ok: true, added: null, count: null };
  // Spent on first read whatever happens next, so a refused add is never retried behind their back.
  jar.delete(WISHLIST_PENDING_COOKIE);
  const pending = decodePendingWishlistAdd(raw);
  if (!pending) return { ok: true, added: null, count: null };

  const tooMany = await limited(session.contactId, "wishlist.claim");
  if (tooMany) return { ok: false, error: tooMany };
  if (!(await isProductVisibleToViewer(pending.productId))) return { ok: false, error: RESTRICTED_PRODUCT_ERROR };
  const result = await addWishlistLine({ contactId: session.contactId, channelId: CHANNEL_ID }, pending);
  if (!result.ok) return { ok: false, error: addRefusal(result.reason) };
  return { ok: true, added: result.item, count: result.count };
}

/** "Update Wishlist": quantities and comments in one batch; a quantity of 0 removes the line. */
export async function updateWishlist(updates: WishlistLineUpdate[]): Promise<UpdateWishlistResult> {
  if (!(await enabled())) return { ok: false, error: UNAVAILABLE };
  const session = await getSession();
  if (!session) return { ok: false, error: "sign_in_required" };
  const tooMany = await limited(session.contactId, "wishlist.update");
  if (tooMany) return { ok: false, error: tooMany };
  if (!Array.isArray(updates)) return { ok: false, error: INVALID };
  // Only the three fields an update may carry cross into the service.
  const clean = updates.map((u) => ({
    itemId: (u as WishlistLineUpdate | null)?.itemId,
    ...(u && "quantity" in u ? { quantity: u.quantity } : {}),
    ...(u && "comment" in u ? { comment: u.comment } : {}),
  }));
  const result = await updateWishlistLines({ contactId: session.contactId, channelId: CHANNEL_ID }, clean);
  if (!result.ok) return { ok: false, error: result.reason === "not_found" ? NOT_FOUND : INVALID };
  return { ok: true, items: await scoped(result.items), removed_ids: result.removed_ids, count: result.count };
}

/** Remove one line from the signed-in contact's list. */
export async function removeFromWishlist(itemId: number): Promise<RemoveFromWishlistResult> {
  if (!(await enabled())) return { ok: false, error: UNAVAILABLE };
  const session = await getSession();
  if (!session) return { ok: false, error: "sign_in_required" };
  const tooMany = await limited(session.contactId, "wishlist.remove");
  if (tooMany) return { ok: false, error: tooMany };
  const result = await removeWishlistLine({ contactId: session.contactId, channelId: CHANNEL_ID }, itemId);
  return { ok: true, removed: result.removed, count: result.count };
}
