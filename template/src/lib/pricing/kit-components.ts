import "server-only";
import { getCommerceClient } from "@keenan/services";
import { CHANNEL_ID } from "@/lib/store";
import { isProductVisibleToViewer } from "@/lib/catalog-scope";
import { resolveItemPricing } from "@/lib/pricing/item-pricing";
import type { KitPrices, ProductKit } from "@/lib/product-kit";

// ============================================================================
// A BUNDLE's components at the price THIS shopper pays for each (card Tc5ekvD6).
//
// Zoey's bundled product with dynamic pricing prices the bundle as the sum of the chosen
// selections. Here the chosen components go into the cart as their OWN lines, each priced by the
// cart's own `resolveItemPricing` — so the product page quotes them through that same function,
// or the page would print one total and the cart charge another (the store-at-add rule on
// `sf-cart`). Called by the product route (to draw the prices) and by `addToCart` (to refuse a
// build that cannot be bought), so the two can never disagree about which parts are buyable.
//
// A component is BUYABLE ONLINE here — and so gets a price — only when every one of these holds,
// each the same test the storefront applies to that product on its own page or in its own cart:
//   - it is sold on THIS storefront (a visible assignment, the product itself visible and not
//     deleted) — CD and IK never cross over;
//   - this shopper may see it (`isProductVisibleToViewer`, the per-account catalogue chokepoint);
//   - staff have not hidden its price or switched it off for the cart (7vu2iEEZ);
//   - it resolves a price above zero.
// Anything else is simply absent from the result: the page prints no price beside it, a build
// that includes it has no total, and the cart refuses that build in words.
// ============================================================================

interface ComponentRow {
  id: number;
  hide_price: boolean | null;
  restrict_add_to_cart: boolean | null;
}

/** The components of `kit` that can be bought online here, with this shopper's unit price ex GST
 *  at the kit row's own quantity (so a bulk break the kit quantity crosses is honoured, as the cart
 *  would honour it). Never throws: an unreadable component is simply not priced. */
export async function priceKitComponents(kit: ProductKit | null): Promise<KitPrices> {
  const out: KitPrices = {};
  if (!kit || kit.kind !== "bundle") return out;
  const qtyById = new Map<number, number>();
  for (const item of kit.items) qtyById.set(item.productId, Math.max(qtyById.get(item.productId) ?? 0, item.quantity));
  const ids = [...qtyById.keys()];
  if (ids.length === 0) return out;

  let rows: ComponentRow[] = [];
  try {
    const sql = getCommerceClient();
    if (!sql) return out;
    rows = await sql<ComponentRow[]>`
      SELECT p.id, p.hide_price, p.restrict_add_to_cart
        FROM product_channel_assignments a
        JOIN products p ON p.id = a.product_id
       WHERE a.channel_id = ${CHANNEL_ID}
         AND a.is_visible = true
         AND p.is_visible = true
         AND COALESCE(p.is_deleted, false) = false
         AND p.id = ANY(${ids})`;
  } catch {
    return out;
  }

  await Promise.all(
    rows
      .filter((r) => r.hide_price !== true && r.restrict_add_to_cart !== true)
      .map(async (r) => {
        const id = Number(r.id);
        try {
          if (!(await isProductVisibleToViewer(id))) return;
          const pricing = await resolveItemPricing(id, null, qtyById.get(id) ?? 1);
          const unit = parseFloat(pricing.salePrice ?? pricing.listPrice);
          if (Number.isFinite(unit) && unit > 0) out[id] = Math.round(unit * 100) / 100;
        } catch {
          // Unpriceable is "not buyable online", never a broken page.
        }
      })
  );
  return out;
}
