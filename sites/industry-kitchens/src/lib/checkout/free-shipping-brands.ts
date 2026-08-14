// ============================================================================
// Brand free-shipping specials — the impure half (reads).
//
// Rules and matching live in `free-shipping-brands-policy.ts`; this module only
// fetches. Split the same way as net-terms / account-options so the money rule
// stays unit-testable without a database.
//
// The setting is read UNCACHED (channelSettingsService straight through, like
// getCheckoutSettings), so switching a special on or off in the portal takes
// effect on the next page load rather than after a cache window — a marketing
// special that keeps giving away freight after it was switched off is a money
// leak, and one that will not start is a support call.
// ============================================================================

import { getCommerceClient } from "@keenan/services";
import { channelSettingsService, CHANNEL_ID } from "@/lib/store";
import {
  parseBrandFreeShippingSpecials,
  activeSpecials,
  todayInMelbourne,
  type MatchedBrandSpecial,
} from "@/lib/checkout/free-shipping-brands-policy";

/** channel_settings key the portal writes (Settings → Shipping). */
export const FREE_SHIPPING_BRANDS_SETTING = "free_shipping_brands";

/**
 * Every brand free-shipping special running RIGHT NOW on this channel, with the
 * brand name resolved for the customer-facing line.
 *
 * Never throws: a missing setting, malformed JSON or a brand lookup failure all
 * degrade to "no special", which just charges normal delivery.
 */
export async function activeBrandFreeShippingSpecials(): Promise<MatchedBrandSpecial[]> {
  try {
    let value: unknown = null;
    try {
      const row = await channelSettingsService.getByKey(CHANNEL_ID, FREE_SHIPPING_BRANDS_SETTING);
      value = row.setting_value;
    } catch {
      return []; // never configured on this channel
    }

    const running = activeSpecials(parseBrandFreeShippingSpecials(value), todayInMelbourne());
    if (running.length === 0) return [];

    const names = await brandNames(running.map((s) => s.brand_id));
    return running.map((s) => ({
      brandId: s.brand_id,
      brandName: names.get(s.brand_id) ?? null,
      endDate: s.end_date,
    }));
  } catch (e) {
    console.error("[free-shipping-brands] lookup failed (non-fatal, normal delivery):", e);
    return [];
  }
}

/** Brand id per product, batched — `null` for a product with no brand. */
export async function brandIdsForProducts(
  productIds: number[]
): Promise<Map<number, number | null>> {
  const out = new Map<number, number | null>();
  const ids = [...new Set(productIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (ids.length === 0) return out;
  try {
    const sql = getCommerceClient();
    if (!sql) return out;
    const rows = await sql<{ id: number; brand_id: number | null }[]>`
      SELECT id, brand_id FROM products WHERE id = ANY(${ids})`;
    for (const row of rows) out.set(Number(row.id), row.brand_id == null ? null : Number(row.brand_id));
  } catch (e) {
    console.error("[free-shipping-brands] product brand lookup failed (non-fatal):", e);
  }
  return out;
}

async function brandNames(brandIds: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const ids = [...new Set(brandIds)];
  if (ids.length === 0) return out;
  try {
    const sql = getCommerceClient();
    if (!sql) return out;
    const rows = await sql<{ id: number; name: string | null }[]>`
      SELECT id, name FROM brands WHERE id = ANY(${ids})`;
    for (const row of rows) if (row.name) out.set(Number(row.id), row.name);
  } catch (e) {
    console.error("[free-shipping-brands] brand name lookup failed (non-fatal):", e);
  }
  return out;
}
