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
import { CHANNEL_ID } from "@/lib/channel";
import type { StockFacts } from "@keenan/services/backorder";
import type { PackFacts } from "@keenan/services/pack";
import { parseChannelRules, type ChannelPurchaseRules } from "@keenan/services/channel-rules";

export type ProductBackorderFacts = StockFacts &
  PackFacts & {
    /** Per-product control: this product may not be added to the cart at all. */
    restrictAddToCart: boolean;
    /** Zoey's "available by quote only" flag (`products.purchasing_disabled`) and its message. */
    purchasingDisabled: boolean;
    purchasingDisabledMessage: string | null;
    /** A hidden price behaves exactly like no price: quote only. */
    hidePrice: boolean;
    /**
     * THIS storefront's Zoey rules (`metafields.zoey_channel_rules[CHANNEL_ID]`, portal PR #1028):
     * quote-only / out-of-stock refuse the cart for everyone, guest quote-only for a guest (see
     * `lib/cart/online-purchase.ts`). Null when the product has none for this channel — every
     * product until the portal backfill runs, and every product on Chefs Depot.
     */
    channelRules: ChannelPurchaseRules | null;
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
        kit_quote_only: boolean | null;
        purchasing_disabled: boolean | null;
        purchasing_disabled_message: string | null;
        hide_price: boolean | null;
        sell_pack_size: number | null;
        sell_pack_unit: string | null;
        channel_rules: unknown;
      }[]
    >`
      SELECT id, inventory_tracking, inventory_level, backorder_policy, restrict_add_to_cart,
             (metafields -> 'channel_kits' -> ${String(CHANNEL_ID)} ->> 'quote_only') = 'true' AS kit_quote_only,
             purchasing_disabled, purchasing_disabled_message, hide_price, sell_pack_size, sell_pack_unit,
             metafields -> 'zoey_channel_rules' -> ${String(CHANNEL_ID)} AS channel_rules
        FROM products
       WHERE id = ANY(${ids})`;
    for (const row of rows) {
      out.set(Number(row.id), {
        inventoryTracking: row.inventory_tracking,
        inventoryLevel: row.inventory_level == null ? null : Number(row.inventory_level),
        backorderPolicy: row.backorder_policy,
        // A bundle Zoey sells by quote only is quote only on the storefront its kit is scoped to
        // (`metafields.channel_kits[<this channel>].quote_only`, IK parity 2026-09-28) — refused
        // with the same sentence as `restrict_add_to_cart`. No other storefront reads the key.
        restrictAddToCart: row.restrict_add_to_cart === true || row.kit_quote_only === true,
        // The other two quote-only switches ride the same read (see `lib/cart/online-purchase.ts`).
        purchasingDisabled: row.purchasing_disabled === true,
        purchasingDisabledMessage: row.purchasing_disabled_message,
        hidePrice: row.hide_price === true,
        // This storefront's Zoey rules, keyed by CHANNEL_ID like `channel_kits` above — the IK key
        // never reaches another storefront. Judged with the viewer by `onlineOrderingOff`.
        channelRules: parseChannelRules(row.channel_rules),
        // The SELLING UNIT rides the same batched read (cards O108e4jH / zeMPVcA3): the cart has
        // to snap a quantity to whole packs and say what a pack holds, and both callers of this
        // lookup already have the product in hand. `products.min_purchase_quantity` is NOT read —
        // it carries Zoey's number, which is a carton on some products and a minimum on others,
        // and we cannot tell which (see `@keenan/services/pack`).
        sellPackSize: row.sell_pack_size == null ? null : Number(row.sell_pack_size),
        sellPackUnit: row.sell_pack_unit,
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
