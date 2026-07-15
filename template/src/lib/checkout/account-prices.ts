import { resolveAccountLinePrices, accountLineKey } from "@keenan/services";
import { cartItemService } from "@/lib/store";
import { getAccountId } from "@/lib/member";

/** The cart-line shape checkout works with (snake_case, straight off cartService.getWithItems). */
export interface CartLine {
  id: number;
  product_id: number;
  variant_id: number | null;
  list_price: string | null;
  sale_price: string | null;
}

/**
 * Reconcile cart lines against the shopper's ACCOUNT contract prices, in place, and persist the
 * change to the cart.
 *
 * Per-account product prices override every other price, so the price CHARGED must be the account's
 * price even when the line was priced earlier (added as a guest, added before the price was set, or
 * added before a bulk tier / member price stopped applying). Lines with no account price are left
 * exactly as they are — guests and accountless shoppers are a no-op (one `getAccountId` call).
 *
 * Mutates the passed lines so the caller's totals (buildLineItems) see the corrected prices.
 */
export async function applyAccountPricesToCart(cartId: number, lines: CartLine[]): Promise<void> {
  const accountId = await getAccountId();
  if (!accountId || lines.length === 0) return;

  const prices = await resolveAccountLinePrices(
    accountId,
    lines.map((l) => ({ productId: l.product_id, variantId: l.variant_id }))
  );
  if (prices.size === 0) return;

  for (const line of lines) {
    const record = prices.get(accountLineKey({ productId: line.product_id, variantId: line.variant_id }));
    if (!record) continue;
    if (line.list_price === record.price && (line.sale_price ?? null) === record.salePrice) continue;
    line.list_price = record.price;
    line.sale_price = record.salePrice;
    try {
      await cartItemService.updateForParent(cartId, line.id, {
        listPrice: record.price,
        salePrice: record.salePrice,
      });
    } catch (e) {
      // Non-fatal: the in-memory line (what we charge) is already correct.
      console.error("[account-prices] failed to persist account price on cart item:", e);
    }
  }
}
