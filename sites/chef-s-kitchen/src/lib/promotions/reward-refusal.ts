// ============================================================================
// Would the cart SELL a promotion's auto-added item? (card EIXdjw2s, review round 3)
//
// A Buy X Get Y "Automatically Add Product To Cart" reward is a cart line the
// shopper never chose and cannot remove — it comes and goes with its offer. If
// that product is one the cart refuses (staff switched it off, Zoey sells it by
// quote only, its price is hidden, this storefront's Zoey rules say quote only /
// out of stock / cart disabled, or it is short of stock under "do not
// back-order"), the shopper is left with a locked line and `placeOrder` refuses
// the whole order telling them to remove it: a dead end. So the reward is judged
// by the SAME rules (`rewardLineRefused`, lib/cart/online-purchase.ts) before the
// cart adds it, every time the cart reads it, and before a tile badges it.
//
// Two batched reads at most (the reward SKUs, then their buying facts), taken
// only when an offer is actually giving something. Never throws, and a lookup
// that fails refuses NOTHING: a reward the basket earned is never taken out of a
// cart over a database blip (the add path still judges each item it adds).
// ============================================================================

import { resolveRewardProducts } from "@keenan/services";
import { backorderFactsForProducts, type ProductBackorderFacts } from "../cart/backorder-facts";
import { rewardLineRefused, type OnlinePurchaseViewer } from "../cart/online-purchase";

type Deps = {
  resolve?: (skus: string[]) => Promise<Map<string, { productId: number; variantId: number | null }>>;
  facts?: (productIds: number[]) => Promise<Map<number, ProductBackorderFacts>>;
};

/** Of these reward products, the ids the cart would refuse to sell this shopper at that quantity. */
export async function refusedRewardProductIds(
  rewards: { productId: number; quantity: number }[],
  viewer?: OnlinePurchaseViewer | null,
  deps: Deps = {}
): Promise<Set<number>> {
  const out = new Set<number>();
  if (!rewards || rewards.length === 0) return out;
  try {
    const facts = await (deps.facts ?? backorderFactsForProducts)(rewards.map((r) => r.productId));
    for (const r of rewards) {
      if (rewardLineRefused(facts.get(r.productId), r.quantity, { viewer })) out.add(r.productId);
    }
  } catch {
    // refuse nothing (see the header)
  }
  return out;
}

/**
 * The reward lines an offer wants, less the ones the cart would refuse. What is left is what the
 * cart should hold: a refused reward is neither added nor kept, and the cart's drift check compares
 * against this list so a refused item does not read as "missing" on every page.
 */
export async function withoutRefusedRewards<T extends { sku: string; quantity: number }>(
  rewardLines: T[],
  viewer?: OnlinePurchaseViewer | null,
  deps: Deps = {}
): Promise<T[]> {
  const live = (rewardLines ?? []).filter((r) => r.quantity > 0);
  if (live.length === 0) return rewardLines ?? [];
  try {
    const products = await (deps.resolve ?? resolveRewardProducts)(live.map((r) => r.sku));
    const asked: { productId: number; quantity: number }[] = [];
    for (const r of live) {
      const p = products.get(r.sku.trim().toUpperCase());
      if (p) asked.push({ productId: p.productId, quantity: r.quantity });
    }
    if (asked.length === 0) return rewardLines;
    const refused = await refusedRewardProductIds(asked, viewer, deps);
    if (refused.size === 0) return rewardLines;
    return rewardLines.filter((r) => {
      const p = products.get(r.sku.trim().toUpperCase());
      // A SKU that did not resolve is kept: the add path skips it anyway, and dropping it would
      // take a held reward out on a failed lookup.
      return !p || !refused.has(p.productId);
    });
  } catch {
    return rewardLines;
  }
}
