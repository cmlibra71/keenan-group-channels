// ============================================================================
// Back-order facts per product — the impure half (one batched read).
//
// The rules (how many units are short, whether the product may be bought at all,
// and the exact wording) live in `@keenan/services/backorder`, which is pure and
// shared with the portal. This module only fetches, in the same shape and with the
// same never-throw discipline as `brandIdsForProducts` in free-shipping-brands.ts.
//
// Card 7vu2iEEZ (Tim, 2026-08-11). Card CXnP1lrL removed every availability string
// from these storefronts, so the cart's back-order line is now the ONLY thing that
// explains a back order to a shopper. A failure here must therefore degrade to
// "nothing is on back order" rather than to a broken cart: a missing note is a
// worse cart, an exception is no cart at all.
// ============================================================================

import { getCommerceClient } from "@keenan/services";
import type { StockFacts } from "@keenan/services/backorder";
import type { PackFacts } from "@keenan/services/pack";

export type ProductBackorderFacts = StockFacts &
  PackFacts & {
    /** Per-product control: this product may not be added to the cart at all. */
    restrictAddToCart: boolean;
  };

/**
 * Stock and buying facts for a set of products, batched. A product missing from the
 * result is treated by every caller as untracked, i.e. no back order and no refusal.
 */
export async function backorderFactsForProducts(
  productIds: number[]
): Promise<Map<number, ProductBackorderFacts>> {
  const out = new Map<number, ProductBackorderFacts>();
  const ids = [...new Set(productIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (ids.length === 0) return out;
  try {
    const sql = getCommerceClient();
    if (!sql) return out;
    const rows = await sql<
      {
        id: number;
        inventory_tracking: string | null;
        inventory_level: number | null;
        backorder_policy: string | null;
        restrict_add_to_cart: boolean | null;
        sell_pack_size: number | null;
        sell_pack_unit: string | null;
        min_purchase_quantity: number | null;
      }[]
    >`
      SELECT id, inventory_tracking, inventory_level, backorder_policy, restrict_add_to_cart,
             sell_pack_size, sell_pack_unit, min_purchase_quantity
        FROM products
       WHERE id = ANY(${ids})`;
    for (const row of rows) {
      out.set(Number(row.id), {
        inventoryTracking: row.inventory_tracking,
        inventoryLevel: row.inventory_level == null ? null : Number(row.inventory_level),
        backorderPolicy: row.backorder_policy,
        restrictAddToCart: row.restrict_add_to_cart === true,
        // The SELLING UNIT rides the same batched read (cards O108e4jH / zeMPVcA3): the cart has
        // to snap a quantity to whole packs and say what a pack holds, and both callers of this
        // lookup already have the product in hand. `@keenan/services/pack` resolves the three.
        sellPackSize: row.sell_pack_size == null ? null : Number(row.sell_pack_size),
        sellPackUnit: row.sell_pack_unit,
        minPurchaseQuantity:
          row.min_purchase_quantity == null ? null : Number(row.min_purchase_quantity),
      });
    }
  } catch (e) {
    console.error("[backorder] product stock lookup failed (non-fatal):", e);
  }
  return out;
}

/** The single-product form, for the add-to-cart guard. */
export async function backorderFactsForProduct(
  productId: number
): Promise<ProductBackorderFacts | null> {
  return (await backorderFactsForProducts([productId])).get(productId) ?? null;
}
