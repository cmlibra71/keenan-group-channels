import { withAddonSurcharge, type ResolvedAddon } from "@keenan/services/product-addons";

/**
 * What an account contract price makes a cart line cost, and whether that differs from what the
 * line currently carries.
 *
 * PURE, and split from the IO in `account-prices.ts` (which reaches the cart and product
 * services) so the money decision is unit-testable — the same split `net-terms-policy.ts` and
 * `account-options-policy.ts` make.
 *
 * THE RULE. An account price replaces what the MACHINE costs that account, never what its
 * accessories cost. `resolveAccountLinePrices` knows nothing about paid extras (card 0CDcCYmO),
 * so the surcharge is put back on top here — exactly as every other re-price path does
 * (`addToCart`, `updateCartItem`, `repriceCartForSession`, the membership-expiry branch in
 * `placeOrder`). Without it a shopper with a contract price on a configured product is SHOWN
 * machine+extras and CHARGED machine only, while `order_items.product_options` still lists the
 * extras — so the warehouse ships them free. That is the Product Brief §3 sign-in rule
 * ("cart lines store their price at ADD time, so any sign-in must RE-PRICE the cart") at the last
 * re-price before the charge.
 *
 * BOTH amounts move by the same figure, via `withAddonSurcharge`, so the `/cart` Discount row —
 * which renders the gap between `list_price` and `sale_price` — cannot sprout a discount the size
 * of the accessories.
 *
 * The staleness comparison is against the SURCHARGED figure, not the raw record: compared against
 * the record a correctly-priced line reads as stale on every order and is rewritten DOWN to the
 * bare machine price.
 */
export function decideAccountPriceWrite(input: {
  record: { price: string; salePrice: string | null };
  resolvedAddons: readonly ResolvedAddon[];
  currentListPrice: string | null;
  currentSalePrice: string | null;
}): { listPrice: string; salePrice: string | null; changed: boolean } {
  const priced = withAddonSurcharge(
    { listPrice: input.record.price, salePrice: input.record.salePrice },
    input.resolvedAddons
  );
  const changed =
    input.currentListPrice !== priced.listPrice ||
    (input.currentSalePrice ?? null) !== (priced.salePrice ?? null);
  return { listPrice: priced.listPrice, salePrice: priced.salePrice, changed };
}

/**
 * Does the account's contract price govern this cart line at checkout? Not when the product is on a
 * running PARTNER SPECIAL (card tJ4audbu). Tim, 18 + 21 Sep 2026: a special is a locked price,
 * "No further discounts", and "Special Price will be the floor" — so it sits above the account
 * contract price in BOTH directions, exactly as `resolveItemPricing` and `repriceCartForSession`
 * already price the line in the cart. Without this the page, the tile and the cart show the
 * special while `placeOrder` charges the contract price, which breaks "shown == charged".
 *
 * A special that has ENDED is not in `liveSpecialProductIds`, so the contract price takes the line
 * back — the account then pays its own price, which is what the product page shows it again.
 */
export function accountPriceGovernsLine(
  productId: number,
  liveSpecialProductIds: { has(id: number): boolean }
): boolean {
  return !liveSpecialProductIds.has(productId);
}
