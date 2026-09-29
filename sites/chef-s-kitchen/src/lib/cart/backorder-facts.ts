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
// Relative (not `@/lib/channel`) so the node test runner can load this module and drive the guard.
import { CHANNEL_ID } from "../channel";
import type { StockFacts } from "@keenan/services/backorder";
import { effectivePackFacts, readChannelPackEntry, type PackFacts } from "@keenan/services/pack";
import { readChannelRules, type ChannelPurchaseRules } from "@keenan/services/channel-rules";

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
     * THIS storefront's EFFECTIVE Zoey rules — `metafields.zoey_channel_rules[CHANNEL_ID]` with the
     * portal's staff overrides (`metafields.channel_rule_overrides`, override ?? zoey per rule) laid
     * over it by the ONE services reader (`readChannelRules`), exactly as the product page, tiles and
     * listings read them — so the cart and checkout guards refuse precisely what the page hides:
     * quote-only / out-of-stock refuse the cart for everyone, guest quote-only for a guest (see
     * `lib/cart/online-purchase.ts`). Null when the product has none for this channel — every
     * product until the portal backfill runs, and every product on Chefs Depot.
     */
    channelRules: ChannelPurchaseRules | null;
  };

/** A postgres-js tagged-template client (the live pool, a transaction, or a test double). */
type SqlClient = (strings: TemplateStringsArray, ...values: unknown[]) => PromiseLike<unknown[]>;

/**
 * Stock and buying facts for a set of products, batched. A product missing from the
 * result is treated by every caller as untracked, i.e. no back order and no refusal.
 */
export async function backorderFactsForProducts(
  productIds: number[],
  /** Test seam: the client and channel to read with. Omitted = the live pool and this storefront. */
  deps: { client?: SqlClient; channelId?: number } = {}
): Promise<Map<number, ProductBackorderFacts>> {
  const out = new Map<number, ProductBackorderFacts>();
  const ids = [...new Set(productIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (ids.length === 0) return out;
  try {
    const channelId = deps.channelId ?? CHANNEL_ID;
    const live = deps.client ? null : getCommerceClient();
    const sql = (deps.client ?? live) as unknown as SqlClient | null;
    if (!sql) return out;
    const rows = (await sql`
      SELECT id, inventory_tracking, inventory_level, backorder_policy, restrict_add_to_cart,
             (metafields -> 'channel_kits' -> ${String(channelId)} ->> 'quote_only') = 'true' AS kit_quote_only,
             purchasing_disabled, purchasing_disabled_message, hide_price, sell_pack_size, sell_pack_unit, qty_packaging_enabled, qty_increment_groups,
             metafields -> 'zoey_channel_rules' AS zoey_channel_rules,
             metafields -> 'zoey_channel_pack' -> ${String(channelId)} AS channel_pack,
             metafields -> 'channel_rule_overrides' AS channel_rule_overrides
        FROM products
       WHERE id = ANY(${ids})`) as unknown as {
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
        qty_packaging_enabled?: boolean | null;
        qty_increment_groups?: unknown;
        zoey_channel_rules: unknown;
        channel_rule_overrides: unknown;
        channel_pack: unknown;
      }[];
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
        // Staff overrides included (the same reader every other surface uses).
        channelRules: readChannelRules(
          { zoey_channel_rules: row.zoey_channel_rules, channel_rule_overrides: row.channel_rule_overrides },
          channelId
        ),
        // The SELLING UNIT rides the same batched read (cards O108e4jH / zeMPVcA3): the cart has
        // to snap a quantity to whole packs and say what a pack holds, and both callers of this
        // lookup already have the product in hand. `products.min_purchase_quantity` is NOT read —
        // it carries Zoey's number, which is a carton on some products and a minimum on others,
        // and we cannot tell which (see `@keenan/services/pack`).
        //
        // THIS storefront's own Zoey pack (`metafields.zoey_channel_pack[CHANNEL_ID]`, keyed like
        // `channel_kits` above) fills a product with no shared pack — Industry Kitchens sells
        // ~4,500 products by the carton in Zoey without the shared columns, which would change
        // Chefs Depot's cart too. Chefs Depot has no entry, so this is the shared columns there.
        ...effectivePackFacts(
          {
            sellPackSize: row.sell_pack_size == null ? null : Number(row.sell_pack_size),
            sellPackUnit: row.sell_pack_unit,
            qtyPackagingEnabled: row.qty_packaging_enabled ?? null,
          },
          readChannelPackEntry(row.channel_pack)
        ),
        // Zoey's per-customer-group increments ("Quantity Increments & Packaging"): the cart steps
        // by the shopper's group row exactly as the product page does (`resolvePackSize(facts,
        // group)`). None carry any today; absent → the base pack, as before.
        qtyIncrementGroups: row.qty_increment_groups ?? null,
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
