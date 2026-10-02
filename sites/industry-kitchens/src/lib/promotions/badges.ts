// ============================================================================
// PRODUCT BADGES for Buy X Get Y and free-freight offers (card EIXdjw2s).
//
// "Badge on the listing page and PDP for eligible products ('Buy this, get X' /
// 'Free freight')." The wording and the eligibility come from ONE place —
// `@keenan/services` `loadPromotionBadges`, which reads the same live promotions
// the cart evaluates — so a tile can never promise an offer the cart would not
// give: only public offers badge (not Admin Only, not limited to accounts or
// groups), only on this storefront, only inside their dates, never on a product
// excluded from promotions.
//
// One promotion read on a storefront running no such offer (Chefs Depot never
// runs one), so a listing page pays almost nothing for this. Never throws: a
// badge that cannot be read is a tile without a badge.
// ============================================================================

import { loadPromotionBadges } from "@keenan/services";
import { CHANNEL_ID } from "@/lib/store";

/** productId → badge wording, for the products on this page. Absent = no badge. */
export async function promotionBadgeMap(
  products: { id: number; sku?: string | null }[]
): Promise<Record<number, string>> {
  if (!products || products.length === 0) return {};
  try {
    const badges = await loadPromotionBadges(
      CHANNEL_ID,
      products
        .filter((p) => Number.isFinite(p.id))
        .map((p) => ({ id: p.id, sku: (p.sku as string | null | undefined) ?? null }))
    );
    return Object.fromEntries(badges);
  } catch {
    return {};
  }
}
