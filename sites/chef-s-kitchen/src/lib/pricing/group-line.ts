import { bulkPricingRuleService, resolveGroupLineRecords } from "@/lib/store";
import { groupLineKey, layerGroupLinePrice } from "@keenan/services/group-pricing";
import { pickBestBulkUnit } from "@/lib/pricing/cart-pricing";

/**
 * WHAT ONE CART LINE COSTS AT THE SHOPPER'S CUSTOMER-GROUP PRICE LIST — Industry Kitchens' Zoey
 * model (services `groupPricing.ts`). The ONE derivation both the cart (`layerItemPricing`, on
 * add / quantity change / sign-in re-price) and checkout (`repriceGroupLinesForCheckout`, at the
 * moment of charging) call, so the price stored on the line and the price charged cannot be two
 * answers.
 *
 * The record prices the line (its regular = list, its special = sale; a catalogue special never
 * undercuts it) and a quantity break wins only below it: the group's own tiers on the record, or
 * the product's universal `bulk_pricing_rules` — the same tiers the cart has always applied on
 * this channel, off the record's list price for a percent tier.
 *
 * Null — the caller keeps its catalogue layering — when there is no group (every channel without
 * `customer_group_pricing`, i.e. Chefs Depot), or the group has no record for this variant.
 * `variantId` null prices the product's default (lowest-id) variant, where a simple product's
 * record lives.
 */
export async function groupLinePricing(
  groupId: number | null | undefined,
  productId: number,
  variantId: number | null | undefined,
  quantity: number,
  /**
   * `tiers: false` — the record alone, no quantity break: a storefront QUOTE line, which applies
   * only the catalogue price at add time and leaves quantity pricing to staff
   * (docs/adr/0001-quote-defers-tier-pricing-to-staff.md).
   */
  opts: { tiers?: boolean } = {}
): Promise<{ listPrice: string; salePrice: string | null } | null> {
  if (!groupId) return null;
  const line = { productId, variantId: variantId ?? null };
  const record = (await resolveGroupLineRecords(groupId, [line])).get(groupLineKey(line));
  if (!record) return null;
  if (opts.tiers === false) return layerGroupLinePrice({ ...record, bulkPricingTiers: null }, 1, null);
  const recordList = parseFloat(String(record.price ?? record.salePrice ?? "0"));
  const rules = await bulkPricingRuleService.listForParent(productId, {
    page: 1,
    limit: 100,
    sort: "quantity_min",
    direction: "asc",
  });
  const bulkUnit = pickBestBulkUnit(rules.data, quantity, recordList);
  return layerGroupLinePrice(record, quantity, bulkUnit);
}
