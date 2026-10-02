import { withAddonSurcharge, type ResolvedAddon } from "@keenan/services/product-addons";

/**
 * Does a cart line still carry the price the shopper's customer-group price list makes it cost?
 *
 * PURE, split from the IO in `group-prices.ts` like `account-prices-policy.ts`. The group price
 * replaces what the MACHINE costs; the paid extras ride on top (`withAddonSurcharge`), exactly as
 * the cart stored them. Money is compared to the cent, not as text: the cart stores what the
 * resolver returned ("6862.5000") and reads back Postgres numerics, and a text compare would call
 * a correctly priced "6.45" line stale against "6.4500" on every order.
 */
export function decideGroupPriceWrite(input: {
  grouped: { listPrice: string; salePrice: string | null };
  resolvedAddons: readonly ResolvedAddon[];
  currentListPrice: string | null;
  currentSalePrice: string | null;
}): { listPrice: string; salePrice: string | null; changed: boolean } {
  const priced = withAddonSurcharge(
    { listPrice: input.grouped.listPrice, salePrice: input.grouped.salePrice },
    input.resolvedAddons
  );
  const changed =
    !sameCents(input.currentListPrice, priced.listPrice) ||
    !sameCents(input.currentSalePrice, priced.salePrice);
  return { listPrice: priced.listPrice, salePrice: priced.salePrice, changed };
}

function sameCents(a: string | null | undefined, b: string | null | undefined): boolean {
  const an = a == null || a === "" ? null : Math.round(parseFloat(a) * 100);
  const bn = b == null || b === "" ? null : Math.round(parseFloat(b) * 100);
  if (an == null || bn == null || !Number.isFinite(an) || !Number.isFinite(bn)) return an === bn;
  return an === bn;
}
