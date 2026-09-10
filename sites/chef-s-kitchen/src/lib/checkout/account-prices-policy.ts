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
