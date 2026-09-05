import { getCommerceClient } from "@keenan/services";
import { CHANNEL_ID } from "@/lib/channel";
import { usableBrandLogo } from "@/lib/brand-logo-url";

// ============================================================================
// Card tSrCcnvx — "IK - Missing Product Images - Default" (Tim, 2026-08-19).
//
// "Missing or broken images to default to brand logo."
//
// BOTH STOREFRONTS, AND THE GATE IS THE CHANNEL — not the tree. The four
// builder files that call this (`{brand,category,product}-node-branch.tsx`,
// `builder-image.tsx`) are declared channel-agnostic in
// `orchestrator/shared-modules.json` and must stay byte-identical across
// template/ and every site, so this module ships to all three trees and refuses
// to do anything on a channel that has not opted in. Forking those four files
// per site instead would have unpicked the seam that stops template fixes
// silently failing to reach a storefront.
//
// WHO RULED WHAT. Tim asked for it on an Industry Kitchens card (2026-08-19)
// and IK shipped first. Steve had ruled the opposite on gRLRF8yu (2026-08-10 —
// "the grey box stays, the fix is finding the products"), so Chefs Depot was
// deliberately left out; Tim is the final word on customer-facing behaviour and
// his instruction was newer, which is a recorded SUPERSESSION rather than two
// live rulings. Steve then asked for the same thing on this card for Chefs
// Depot on 2026-08-24 — "Please implement the same temporary fix for Chefs
// Depot, until the missing images are sourced" — so gRLRF8yu's grey-box ruling
// is now superseded on BOTH storefronts by its own author. It is TEMPORARY by
// Steve's own words: finding the real pictures is still the fix, and Products →
// Missing Images is still where a gap gets chased. Recorded in
// docs/behaviour/catalogue.md and the decision vault. Turning it off for a
// storefront again is one number in the set below.
//
// WHAT THE FALLBACK IS. The brand's normalised logo (`brands.image_url`, the
// 600x300 pipeline; 412 of 418 brands carry one on 2026-08-22). A product whose
// brand has no logo — or which has no brand at all — keeps the grey box with the
// package icon, exactly as before. So this never REPLACES the empty state, it
// only takes the cases it can actually improve.
//
// WHY THE ALLOWLIST GATE. `/api/image` 403s anything outside our own buckets,
// and a 403 renders as the browser's broken-image glyph — which is worse than
// the grey box we are replacing. `isAllowedImageUrl` is the proxy's own
// predicate, so a logo it would refuse is treated here as no logo at all. Same
// reasoning the department tiles use (LrRNJiEY).
// ============================================================================

/**
 * Channels on which an imageless or broken-image product falls back to its
 * brand's logo. 1 = Industry Kitchens (Tim, 2026-08-19), 2 = Chefs Depot
 * (Steve, 2026-08-24, as a temporary measure until the pictures are sourced).
 * A channel absent from this set renders exactly the storefront it was before
 * the card — no query, no field, no copies of its rows.
 */
const BRAND_LOGO_FALLBACK_CHANNELS = new Set<number>([1, 2]);

/** True when this storefront's channel has opted into the brand-logo fallback. */
export function brandLogoFallbackEnabled(): boolean {
  return BRAND_LOGO_FALLBACK_CHANNELS.has(CHANNEL_ID);
}

/** What a tile or gallery needs to draw the fallback. */
export interface BrandLogoFallback {
  /** Usable (allowlisted) brand logo URL, or null. */
  brand_logo_url: string | null;
  /** The brand's name — the fallback image's ALT text. */
  brand_name: string | null;
}

/** A row that can carry the fallback fields. */
export type WithBrandLogo<T> = T & BrandLogoFallback;

/** Re-exported so a server caller needs only this module. */
export { usableBrandLogo };

/**
 * Brand logo + brand name for a set of product ids, in ONE query.
 *
 * Fetched for EVERY row on the page, not only the ones we can already see are
 * imageless: half this card is BROKEN images, and a broken file is only
 * discovered in the browser (`onError`), by which point no further server round
 * trip is available. The query is a two-join primary-key lookup over at most a
 * page of ids, and returns nothing for brandless products or logo-less brands.
 */
export async function getBrandLogos(
  productIds: number[]
): Promise<Map<number, BrandLogoFallback>> {
  const ids = Array.from(
    new Set(productIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))
  );
  const out = new Map<number, BrandLogoFallback>();
  if (ids.length === 0) return out;
  // Not this channel's behaviour: no query, no field, nothing to render.
  if (!brandLogoFallbackEnabled()) return out;

  try {
    const sql = getCommerceClient();
    // `getCommerceClient` is null until `initCommerceDb` has run; every caller
    // here is a page render, which imports `@/lib/store` and therefore has, but
    // the fallback must never be the thing that throws.
    if (!sql) return out;
    const rows = (await sql`
      SELECT p.id AS product_id, b.name AS brand_name, b.image_url AS brand_logo_url
      FROM products p
      JOIN brands b ON b.id = p.brand_id
      WHERE p.id = ANY(${ids}::int[])
        AND b.image_url IS NOT NULL
        AND b.image_url <> ''
    `) as unknown as { product_id: number; brand_name: string | null; brand_logo_url: string }[];

    for (const row of rows) {
      const logo = usableBrandLogo(row.brand_logo_url);
      if (!logo) continue;
      out.set(Number(row.product_id), {
        brand_logo_url: logo,
        brand_name: row.brand_name ?? null,
      });
    }
  } catch {
    // A listing must never fail because a decorative fallback could not be
    // resolved: no logos means every imageless tile keeps the grey box, which
    // is the behaviour that shipped before this card.
    return out;
  }
  return out;
}

/**
 * Copy of the rows with `brand_logo_url` / `brand_name` attached.
 *
 * Additive by construction — every other field is copied through untouched — so
 * it is safe to run over rows that are on their way into an authored node
 * payload (`enrichProductCardRows` spreads the row it is given) as well as over
 * rows on their way into the React `ProductCard`.
 */
export async function attachBrandLogos<T extends { id: number | string }>(
  rows: T[]
): Promise<WithBrandLogo<T>[]> {
  if (!rows || rows.length === 0) return [] as WithBrandLogo<T>[];
  // Off on this channel: hand the caller back the SAME rows, not copies carrying
  // two null fields. A channel that has not opted in must be byte-for-byte the
  // storefront it was before this card.
  if (!brandLogoFallbackEnabled()) return rows as WithBrandLogo<T>[];
  const logos = await getBrandLogos(rows.map((r) => Number(r.id)));
  return rows.map((row) => {
    const hit = logos.get(Number(row.id));
    return {
      ...row,
      brand_logo_url: hit?.brand_logo_url ?? null,
      brand_name: hit?.brand_name ?? (row as { brandName?: string | null }).brandName ?? null,
    };
  });
}
