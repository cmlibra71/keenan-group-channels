import { resolveAccountLinePrices, accountLineKey } from "@keenan/services";
import {
  readProductAddons,
  readStoredAddons,
  resolveAddonSelection,
  storedAddonsAsSelection,
  type ResolvedAddon,
} from "@keenan/services/product-addons";
import { cartItemService, productService } from "@/lib/store";
import { decideAccountPriceWrite } from "./account-prices-policy";
import { getAccountId } from "@/lib/member";

/** The cart-line shape checkout works with (snake_case, straight off cartService.getWithItems). */
export interface CartLine {
  id: number;
  product_id: number;
  variant_id: number | null;
  list_price: string | null;
  sale_price: string | null;
  /**
   * The line's paid extras as stored (card 0CDcCYmO). Also holds the variant-modifier object the
   * REST API writes on lines that have nothing to do with extras, which is why every reader goes
   * through `readStoredAddons` rather than trusting the column's shape.
   */
  modifier_selections?: unknown;
}

/**
 * A line's extras re-resolved against the PRODUCT'S CURRENT definition — the rule every re-price
 * on this repo follows. The stored bag records WHAT was chosen; the product records what it costs.
 * A lookup failure falls back to the stored picks rather than to nothing: charging the shopper for
 * the configuration they were shown beats silently dropping the accessories off the price.
 */
async function resolveLineAddons(line: CartLine): Promise<ResolvedAddon[]> {
  const stored = readStoredAddons(line.modifier_selections);
  if (stored.length === 0) return [];
  try {
    const product = (await productService.getById(line.product_id)) as { metafields?: unknown } | null;
    return resolveAddonSelection(readProductAddons(product?.metafields), storedAddonsAsSelection(stored));
  } catch (e) {
    console.error("[account-prices] addon re-resolve failed (non-fatal):", e);
    return stored;
  }
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
    const next = decideAccountPriceWrite({
      record,
      // Only read the product back for a line that actually carries extras — this runs on every
      // order for every account-priced line, and the overwhelming majority carry none.
      resolvedAddons: await resolveLineAddons(line),
      currentListPrice: line.list_price,
      currentSalePrice: line.sale_price,
    });
    if (!next.changed) continue;
    line.list_price = next.listPrice;
    line.sale_price = next.salePrice;
    try {
      await cartItemService.updateForParent(cartId, line.id, {
        listPrice: next.listPrice,
        salePrice: next.salePrice,
      });
    } catch (e) {
      // Non-fatal: the in-memory line (what we charge) is already correct.
      console.error("[account-prices] failed to persist account price on cart item:", e);
    }
  }
}
