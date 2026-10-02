import { resolveAccountLinePrices, accountLineKey } from "@keenan/services";
import { readStoredAddons } from "@keenan/services/product-addons";
import { cartItemService, getLiveSpecials } from "@/lib/store";
import { getAccountId, getPricingGroupId } from "@/lib/member";
import { groupLinePricing } from "@/lib/pricing/group-line";
import { resolveLineAddons, type CartLine } from "./account-prices";
import { decideGroupPriceWrite } from "./group-prices-policy";

/**
 * Reconcile cart lines against the shopper's CUSTOMER-GROUP price list at the moment of charging
 * (Industry Kitchens' Zoey model, services `groupPricing.ts`), and persist any correction.
 *
 * Cart lines store their price at ADD time and are re-priced on sign-in, so a line normally
 * already carries its group price. This is the last check before the charge, for the lines that
 * do not: the shopper's group changed after they added it, the price list changed, or the line
 * was added before group pricing was switched on. It uses the SAME derivation the cart does
 * (`groupLinePricing`), so a correctly priced line is never touched.
 *
 * Returns how many lines moved. The caller REFUSES the order when any did — the checkout page
 * showed the old figures, and the rule is never to charge a price the shopper was not shown
 * (the same stance as the membership-expiry branch). The corrected prices are already saved, so
 * the retry goes through at the price now on screen.
 *
 * Skipped entirely — no query past one cached settings read — on a channel without
 * `customer_group_pricing` (Chefs Depot). Lines carrying an ACCOUNT contract price are left to
 * `applyAccountPricesToCart`, which already reconciled them: an account price beats the group.
 * A line with no price of its own (POA) and a line whose group has no record are left alone.
 * A line on a live PARTNER SPECIAL is left alone too (card tJ4audbu): the special is locked over
 * the group price, the cart priced it that way, and `refreshSpecialPricesInCart` has already
 * re-judged it before this runs — re-deriving it from the group list would charge the group price
 * under a "no further discounts" badge, or refuse the order in a loop.
 * Mutates the passed lines so the caller's totals see the corrected prices.
 */
export async function repriceGroupLinesForCheckout(
  cartId: number,
  lines: Array<CartLine & { quantity: number }>
): Promise<number> {
  const groupId = await getPricingGroupId();
  if (!groupId || lines.length === 0) return 0;

  const accountId = await getAccountId();
  const accountPriced = accountId
    ? await resolveAccountLinePrices(
        accountId,
        lines.map((l) => ({ productId: l.product_id, variantId: l.variant_id }))
      )
    : new Map();

  // A failed lookup reads as "no special", the fallback every other cart reprice takes.
  const onSpecial: Map<number, unknown> = await getLiveSpecials([...new Set(lines.map((l) => l.product_id))]).catch(
    () => new Map()
  );

  let moved = 0;
  for (const line of lines) {
    if (onSpecial.has(line.product_id)) continue;
    if (accountPriced.has(accountLineKey({ productId: line.product_id, variantId: line.variant_id }))) continue;
    if (!(parseFloat(String(line.list_price ?? "0")) > 0)) continue;
    const grouped = await groupLinePricing(groupId, line.product_id, line.variant_id, line.quantity);
    if (!grouped) continue;
    const resolvedAddons = readStoredAddons(line.modifier_selections).length > 0 ? await resolveLineAddons(line) : [];
    const next = decideGroupPriceWrite({
      grouped,
      resolvedAddons,
      currentListPrice: line.list_price,
      currentSalePrice: line.sale_price,
    });
    if (!next.changed) continue;
    line.list_price = next.listPrice;
    line.sale_price = next.salePrice;
    moved++;
    try {
      await cartItemService.updateForParent(cartId, line.id, { listPrice: next.listPrice, salePrice: next.salePrice });
    } catch (e) {
      // Non-fatal: the order is refused this time anyway; the next attempt re-derives it.
      console.error("[group-prices] failed to persist group price on cart item:", e);
    }
  }
  return moved;
}
