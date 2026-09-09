"use server";

import { cache } from "react";
import { cartService, cartItemService, productService, productVariantService, contactService, bulkPricingRuleService, getEffectivePrice, applyAdvertisedLadderPrices, getMemberLadderLevelId, CHANNEL_ID } from "@/lib/store";
import {
  resolveAccountLinePrices,
  accountLineKey,
  readProductAddons,
  resolveAddonSelection,
  addonSelectionKey,
  readStoredAddons,
  withAddonSurcharge,
  storedAddonsAsSelection,
  type AddonSelectionInput,
  type ResolvedAddon,
} from "@keenan/services";
import { getAccountId } from "@/lib/member";
import { isProductVisibleToViewer, blockedProductIds, RESTRICTED_PRODUCT_ERROR } from "@/lib/catalog-scope";
import { getFeatureFlag, getActiveSubscriptionForContact, shouldSuppressCatalogSalePrice } from "@/lib/store";
import { getCartUuid, setCartUuid } from "@/lib/cart";
import { brandIdsForProducts } from "@/lib/checkout/free-shipping-brands";
import { backorderFactsForProducts, backorderFactsForProduct, type ProductBackorderFacts } from "@/lib/cart/backorder-facts";
import { availableUnits, canPurchaseQuantity, resolveBackorderPolicy } from "@keenan/services/backorder";
import { resolvePackSize, resolvePackUnit, snapToPack } from "@keenan/services/pack";
import { getSession } from "@/lib/auth";
import { pickBestBulkUnit, layerCartPrice } from "@/lib/pricing/cart-pricing";
import { customisationRefusal } from "@/lib/product-customisation";

async function getOrCreateCart() {
  const uuid = await getCartUuid();

  if (uuid) {
    const cart = await cartService.getByUuid(uuid);
    if (cart) return cart;
  }

  const cart = await cartService.create({
    channelId: CHANNEL_ID,
  }) as { id: number; uuid: string; [key: string]: unknown };

  await setCartUuid(cart.uuid);
  return cart;
}


/** Total units in the cart — returned by item mutations so the client can
 *  update the header badge without a route re-render. Direct service read
 *  (NOT the react-cache()d readCart, which would memoise pre-mutation data
 *  within this same request). */
async function countCartItems(cartId: number): Promise<number> {
  const full = await cartService.getWithItems(cartId);
  return (full?.items ?? []).reduce(
    (sum: number, i: { quantity: number }) => sum + (i.quantity ?? 0),
    0
  );
}

/**
 * Best (lowest) per-unit price from a product's bulk pricing tiers for a given
 * quantity, or null if no tier applies. "price" tiers are an absolute per-unit
 * amount; "percent" tiers are a discount off the list (RRP) price — matching how
 * the PDP renders the Bulk Pricing table (ProductDetail.tsx). All current data is
 * "price", but percent is handled for forward-compatibility.
 */
async function bestBulkUnitPrice(productId: number, quantity: number, listPrice: number): Promise<number | null> {
  // listForParent is precisely typed (snake_case Row); tier matching is pure —
  // delegated to pickBestBulkUnit (lib/pricing/cart-pricing.ts).
  const result = await bulkPricingRuleService.listForParent(productId, {
    page: 1,
    limit: 100,
    sort: "quantity_min",
    direction: "asc",
  });
  return pickBestBulkUnit(result.data, quantity, listPrice);
}

/**
 * Resolve the prices to store for a cart line, for the GIVEN quantity. The
 * effective per-unit charge always flows through `salePrice` (list price stays
 * RRP), so the cart total, the cart display and checkout all read the same
 * number — guaranteeing charged == shown. Recomputed on every quantity change
 * because bulk tiers are quantity-dependent.
 *
 * Layers, best-price-wins:
 *   1. catalog sale price (the channel's public price; suppressed on member-only
 *      cost-plus channels like Chef's Depot, where RRP applies without a member),
 *   2. member (cost-plus) price for an active subscriber,
 *   3. bulk quantity-break tiers (only on channels that don't suppress the
 *      catalog — e.g. Industry Kitchens; these match the legacy site's tier pricing).
 */
async function resolveItemPricing(
  productId: number,
  variantId: number | null | undefined,
  quantity: number,
  /** The product row, when the CALLER has already read it. `addToCart` reads it to
   *  find the product's customisation groups (card kyMjCmAw), and re-reading the
   *  same row here would put a second round trip on the hottest storefront action
   *  for nothing. Omitted everywhere else, and read below exactly as before. */
  productRow?: { price: string; sale_price: string | null } | null
): Promise<{ listPrice: string; salePrice: string | null }> {
  const product =
    productRow !== undefined
      ? productRow
      : ((await productService.getById(productId)) as { price: string; sale_price: string | null } | null);
  if (!product) throw new Error("Product not found");

  // ── ACCOUNT CONTRACT PRICE: an unconditional override (Zoey: "takes priority over ALL other
  // Product prices"). Resolved BEFORE any layering, and returned directly — the catalogue sale
  // price, the member/cost-plus price and the bulk tiers below must not undercut or replace it.
  const accountId = await getAccountId();
  if (accountId) {
    const key = accountLineKey({ productId, variantId });
    const record = (
      await resolveAccountLinePrices(accountId, [{ productId, variantId }])
    ).get(key);
    if (record) return { listPrice: record.price, salePrice: record.salePrice };
  }

  let listPrice = product.price;
  // NOTE: getById returns snake_case — read sale_price (reading salePrice silently
  // yielded undefined, so IK was charging RRP instead of its public sale price).
  let catalogSalePrice: string | null = product.sale_price ?? null;

  if (variantId) {
    const variant = (await productVariantService.getById(variantId)) as { price: string | null; sale_price: string | null } | null;
    if (variant?.price) listPrice = variant.price;
    if (variant?.sale_price) catalogSalePrice = variant.sale_price;
  }

  // ── THE ADVERTISED PRICE (card gk23c1VK). On a channel whose buying-group
  // ladder advertises the Industry Kitchens trade price, the cart's list price
  // is M — the same figure the product page and the listing card showed. A cart
  // that re-derived RRP here would charge a price the shopper never saw, which
  // is the exact failure the "cart lines store their price at ADD time" rule
  // exists to prevent. No-op on a channel with no ladder switched on.
  {
    const [row] = await applyAdvertisedLadderPrices([
      {
        id: productId,
        price: listPrice,
        ...(variantId ? { variants: [{ id: variantId, price: listPrice }] } : {}),
      },
    ]);
    const advertised =
      (row as { variants?: Array<{ price?: unknown }> }).variants?.[0]?.price ??
      (row as { price?: unknown }).price;
    if (typeof advertised === "string" && parseFloat(advertised) > 0) listPrice = advertised;
  }

  // Channels with member-only cost-plus pricing suppress the shared catalog sale
  // price (it's another channel's public price) AND bulk tiers — list price stays RRP.
  const suppress = await shouldSuppressCatalogSalePrice();

  // Member (cost-plus) price for an active subscriber, if member pricing is enabled.
  let memberSalePrice: string | null = null;
  const memberPricingEnabled = await getFeatureFlag("member_pricing_enabled");
  if (memberPricingEnabled) {
    const session = await getSession();
    if (session) {
      const activeSub = await getActiveSubscriptionForContact(session.contactId);
      if (activeSub) {
        const contact = (await contactService.getById(session.contactId)) as { customer_group_id: number | null } | null;
        if (contact?.customer_group_id) {
          const variantResult = variantId ? null : await productVariantService.listForParent(productId, { page: 1, limit: 1, sort: "id", direction: "asc" });
          const pricingVariantId = variantId || (variantResult?.data[0] as { id: number } | undefined)?.id;
          if (pricingVariantId) {
            // The shopper's rung on the buying-group ladder, resolved the same
            // way every other pricing surface resolves it. Null off-ladder.
            const ladderLevelId = await getMemberLadderLevelId({
              accountId,
              contactId: session.contactId,
            }).catch(() => null);
            const pricing = await getEffectivePrice(
              pricingVariantId,
              CHANNEL_ID,
              contact.customer_group_id,
              quantity,
              // accountId is deliberately NOT passed. The account's own contract
              // prices are resolved separately above (`resolveAccountLinePrices`)
              // and take priority over everything; handing them to the engine here
              // too would be a second, unannounced pricing path on sf-cart for both
              // storefronts, which is not what this card is for. The ladder needs
              // only the rung.
              null,
              null,
              ladderLevelId
            );
            if (pricing.salePrice) memberSalePrice = pricing.salePrice;
          }
        }
      }
    }
  }

  // Bulk (quantity-break) tiers — only where the catalog isn't suppressed.
  const bulkUnit = suppress ? null : await bestBulkUnitPrice(productId, quantity, parseFloat(listPrice));

  // Layer the sources, best-price-wins (pure — see lib/pricing/cart-pricing.ts).
  return layerCartPrice({ listPrice, catalogSalePrice, suppress, memberSalePrice, bulkUnit });
}

/**
 * The two per-product refusals (card 7vu2iEEZ), enforced HERE and not only in the page, because a
 * stale tab or a hand-posted action would otherwise book something staff switched off.
 *
 * Stock alone never refuses: an empty shelf is a back order, and the cart says so. Only a product
 * explicitly set to "No - do not let this product be purchased when Out of Stock" is turned away,
 * and only for the units that are not on the shelf.
 */
const CART_RESTRICTED_ERROR = "This product isn't available to order online — please add it to a quote.";
const CART_QUANTITY_ERROR = "This product is not available in the requested quantity.";

async function refuseCartQuantity(
  productId: number,
  quantity: number,
  known?: ProductBackorderFacts | null
): Promise<string | null> {
  const facts = known !== undefined ? known : await backorderFactsForProduct(productId);
  if (!facts) return null; // unknown product: leave it to the pricing lookup below to fail properly
  if (facts.restrictAddToCart) return CART_RESTRICTED_ERROR;
  if (!canPurchaseQuantity(facts, quantity)) return CART_QUANTITY_ERROR;
  return null;
}

/**
 * The cart line carrying THIS product/variant in THIS configuration, or null.
 *
 * Scanned rather than looked up because `findByProductVariant` answers "is this
 * product in the cart", and on a customisable product that is the wrong question:
 * two benches with different measurements are two lines of the same product.
 *
 * SCOPED IN SQL AND PAGED TO EXHAUSTION, both for the same reason. A single
 * fixed page of the whole cart could miss the match on a long cart, and a missed
 * match does not degrade gracefully — it falls through to `createForParent`,
 * whose `validateUniqueConstraints` then throws a `ConflictError` out of an
 * unguarded server action. That is a 500 on Add to Cart where the targeted lookup
 * this replaced could not fail. `product_id` is an allowed filter on
 * `cart_items`, so the scan reads only the lines of the one product being added
 * and the pages are the different CONFIGURATIONS of it, which is a handful.
 */
async function findConfiguredCartLine(
  cartId: number,
  productId: number,
  variantId: number | null,
  wantedConfiguration: string
): Promise<{ id: number; quantity: number } | null> {
  const limit = 100;
  for (let page = 1; ; page += 1) {
    const result = await cartItemService.listForParent(cartId, {
      page,
      limit,
      sort: "id",
      direction: "asc",
      filters: { product_id: { type: "eq", value: productId } },
    });
    const rows = result.data as unknown as Array<{
      id: number;
      quantity: number;
      variant_id: number | null;
      modifier_selections?: unknown;
    }>;
    const match = rows.find(
      (item) =>
        (item.variant_id ?? null) === variantId &&
        addonSelectionKey(readStoredAddons(item.modifier_selections)) === wantedConfiguration
    );
    if (match) return { id: match.id, quantity: match.quantity };
    // Stop on a short page as well as on the count: a `total` that disagrees with
    // what came back must never turn this into an unbounded loop.
    if (rows.length < limit || page * limit >= (result.pagination?.total ?? 0)) return null;
  }
}

export async function addToCart(
  productId: number,
  variantId?: number | null,
  quantity: number = 1,
  /**
   * What the shopper configured on the page: ticked extras and typed answers, in one
   * bag (cards 0CDcCYmO + kyMjCmAw). Re-resolved SERVER-SIDE below against this
   * product's own definition, so a hand-made request can neither invent a choice nor
   * slip past a required one. Undefined means "this renderer offered no panel".
   */
  addons?: AddonSelectionInput | null
) {
  // "What we show is what we accept" — a product restricted away from this shopper is not addable,
  // even by poking the action directly (the listing/PDP guards are UX; THIS is the enforcement).
  if (!(await isProductVisibleToViewer(productId))) return { error: RESTRICTED_PRODUCT_ERROR };

  // ── Customisation the shopper configured on the page ────────────────────────
  // The same re-resolution the quote does. A `text` answer resolves at $0.00, so a
  // typed instruction changes nothing about the money; a PRICED extra does, and
  // `withAddonSurcharge` below is what keeps the till agreeing with the page (the
  // provider's `displayPrice` already includes the extras).
  const productRow = (await productService.getById(productId)) as
    | { metafields?: unknown; price: string; sale_price: string | null }
    | null;
  if (!productRow) return { error: "Product not found" };
  const productAddons = readProductAddons(productRow.metafields);

  // THE REQUIRED-ANSWER CHECK RUNS WHETHER OR NOT A PANEL WAS OFFERED — the same
  // rule, and the same reason, as the matching block in `addToQuote`. A listing
  // tile, a related-products rail and the authored `product-card` master call this
  // with no `addons` argument, and 7vu2iEEZ's rule for those surfaces is that the
  // tile keeps its button and the CART is what refuses. Skipping the check when the
  // argument is absent turned that refusal into a silent success.
  // Worded, never silent: this page carries no wording that could explain a control
  // that quietly did nothing (`sf-product-page`, CXnP1lrL + 7vu2iEEZ).
  const customisationError = customisationRefusal(productAddons, addons, "cart");
  if (customisationError) return { error: customisationError };

  // `undefined` means "this renderer offered no panel": nothing is resolved, so the
  // line keys as unconfigured and behaves exactly as it did before this card.
  const resolvedAddons: ResolvedAddon[] =
    addons === undefined ? [] : resolveAddonSelection(productAddons, addons);
  const wantedConfiguration = addonSelectionKey(resolvedAddons);

  // The cart row is only created once the add can actually succeed: a refusal above
  // must not leave an empty cart behind for a shopper who was turned away.
  const cart = await getOrCreateCart();

  // Is this product/variant already in the cart AS THIS CONFIGURATION? Two benches
  // with different measurements are two lines, not one line of quantity 2 carrying
  // whichever instruction was typed first (card kyMjCmAw).
  //
  // ONLY a product that actually asks a question pays for that. Add to Cart is the
  // hottest action on either storefront and a customisable product is a handful of
  // rows in the catalogue, so a product with no customisation groups keeps the ONE
  // targeted lookup it has always used — the configuration of every line on it is
  // the empty key, so product + variant already decides it. `listForParent` reads
  // `cart_items` alone; `getWithItems` would join products and variants for every
  // line in the cart to answer a question about one of them.
  const existing = productAddons
    ? await findConfiguredCartLine(cart.id, productId, variantId ?? null, wantedConfiguration)
    : ((await cartItemService.findByProductVariant(cart.id, productId, variantId)) as {
        id: number;
        quantity: number;
      } | null);

  const wantedQty = existing ? existing.quantity + Math.max(1, quantity) : Math.max(1, quantity);

  const facts = await backorderFactsForProduct(productId);
  // A product sold by the carton is bought by the carton, wherever the add came from (cards
  // O108e4jH / zeMPVcA3). The product page already steps in whole packs; this covers the listing
  // tile, a stale form and a direct call — snapping UP, so a shopper is never handed less than
  // they asked for. On everything else `snapToPack` returns the quantity untouched.
  const packSize = resolvePackSize(facts);
  const finalQty = snapToPack(wantedQty, packSize);

  const refusal = await refuseCartQuantity(productId, finalQty, facts);
  if (refusal) return { error: refusal };

  // Price for the FINAL quantity (so crossing a bulk tier re-prices the whole line),
  // then the extras on top of BOTH stored amounts — see `withAddonSurcharge`.
  let pricing: { listPrice: string; salePrice: string | null };
  try {
    pricing = withAddonSurcharge(
      // The row this action already read, handed straight on — one `getById` per
      // add, the same as before this card.
      await resolveItemPricing(productId, variantId, finalQty, productRow),
      resolvedAddons
    );
  } catch {
    return { error: "Product not found" };
  }

  if (existing) {
    await cartItemService.updateForParent(cart.id, existing.id, {
      quantity: finalQty,
      listPrice: pricing.listPrice,
      salePrice: pricing.salePrice,
    });
  } else {
    await cartItemService.createForParent(cart.id, {
      productId,
      variantId: variantId || null,
      quantity: finalQty,
      listPrice: pricing.listPrice,
      salePrice: pricing.salePrice,
      // The picks, never a total: a stored total would be a second copy of the money
      // and the two would drift the moment staff re-price an extra.
      modifierSelections: resolvedAddons,
    });
  }

  return { success: true, cartCount: await countCartItems(cart.id) };
}

/**
 * Re-price ONE cart line at a new quantity, carrying the configuration it already
 * holds.
 *
 * A line's stored picks are re-read through the product's CURRENT definition rather
 * than trusted, so an extra staff have since re-priced or deleted moves or drops out
 * on the next quantity change — the same promise the catalogue price on the line
 * makes. A `text` answer round-trips unchanged and adds nothing, which is what makes
 * this safe to run over every line (card kyMjCmAw).
 */
async function repriceConfiguredLine(
  productId: number,
  variantId: number | null,
  quantity: number,
  storedModifiers: unknown
): Promise<{ listPrice: string; salePrice: string | null }> {
  const base = await resolveItemPricing(productId, variantId, quantity);
  const stored = readStoredAddons(storedModifiers);
  if (stored.length === 0) return base;
  const productRow = (await productService.getById(productId)) as { metafields?: unknown } | null;
  const resolved = resolveAddonSelection(
    readProductAddons(productRow?.metafields),
    storedAddonsAsSelection(stored)
  );
  return withAddonSurcharge(base, resolved);
}

export async function updateCartItem(itemId: number, quantity: number) {
  // Whole body is guarded: a transient DB/pool failure here must never escape as
  // an unhandled rejection. Return { error } instead; the client falls back to
  // router.refresh() to re-sync. On success the fresh cartCount is returned so
  // the caller updates the badge/state in place — no route re-render.
  try {
    const uuid = await getCartUuid();
    if (!uuid) return { error: "No cart" };

    const cart = await cartService.getByUuid(uuid);
    if (!cart) return { error: "Cart not found" };

    if (quantity <= 0) {
      // Idempotent: removing an already-deleted line (e.g. rapid minus clicks on
      // the last unit, or a raced concurrent remove) is a no-op success.
      await cartItemService.deleteForParent(cart.id, itemId);
      return { success: true, cartCount: await countCartItems(cart.id) };
    }

    // Re-price the line for the new quantity so bulk tiers are applied/removed as
    // the quantity crosses a break (the stored salePrice carries the effective price).
    const full = await cartService.getWithItems(cart.id);
    // getWithItems returns snake_case rows — read product_id / variant_id (reading
    // the camelCase keys yielded undefined, so re-pricing threw on every change).
    const item = full?.items.find((i: { id: number }) => i.id === itemId) as
      | {
          id: number;
          product_id: number;
          variant_id: number | null;
          quantity: number;
          modifier_selections?: unknown;
        }
      | undefined;

    // Line already gone (raced with a concurrent remove) — nothing to update.
    if (!item) {
      return { success: true, cartCount: await countCartItems(cart.id) };
    }

    // Whole packs here too (cards O108e4jH / zeMPVcA3). A quantity of zero or less has already
    // removed the line above, so a pack product can still be emptied out of the cart; anything
    // that survives to here is rounded up to a whole pack.
    const packFacts = await backorderFactsForProduct(item.product_id);
    const nextQuantity = snapToPack(quantity, resolvePackSize(packFacts));

    // Same refusal as the add, so a "+" cannot walk past a limit the add refused (card 7vu2iEEZ).
    // Only an INCREASE is judged: a line already in the basket when staff changed the setting must
    // still be reducible and removable, or the shopper is stuck with a cart they cannot empty.
    if (nextQuantity > item.quantity) {
      const refusal = await refuseCartQuantity(item.product_id, nextQuantity, packFacts);
      if (refusal) return { error: refusal };
    }

    // Re-pricing can throw (product lookup); never let it block the quantity
    // change — fall back to updating just the quantity, matching addToCart.
    let pricing: { listPrice: string; salePrice: string | null } | null = null;
    try {
      pricing = await repriceConfiguredLine(
        item.product_id,
        item.variant_id,
        nextQuantity,
        item.modifier_selections
      );
    } catch {
      pricing = null;
    }

    await cartItemService.updateForParent(
      cart.id,
      itemId,
      pricing
        ? { quantity: nextQuantity, listPrice: pricing.listPrice, salePrice: pricing.salePrice }
        : { quantity: nextQuantity }
    );

    return { success: true, cartCount: await countCartItems(cart.id) };
  } catch (e) {
    console.error("[updateCartItem] failed (non-fatal):", e);
    return { error: "Could not update cart" };
  }
}

export async function removeCartItem(itemId: number) {
  return updateCartItem(itemId, 0);
}

/**
 * Re-price every line of the current cart for the CURRENT viewer, and persist.
 *
 * Line prices are resolved and STORED when the line is added, so a cart built as
 * a guest keeps guest prices after the shopper signs in — while placeOrder
 * reconciles account contract prices at the moment of charging. The shopper
 * therefore used to sign in at checkout and see no change, then be charged
 * something else. Called from every sign-in path (panel login/register, Google,
 * the sign-in page) so what they SEE after signing in is what they'll pay:
 * account contract prices, member/cost-plus prices, bulk tiers.
 *
 * Never throws and never blocks the sign-in it hangs off: a line that can't be
 * re-priced (product gone) is left exactly as it was.
 */
export async function repriceCartForSession(): Promise<{ repriced: number }> {
  try {
    const uuid = await getCartUuid();
    if (!uuid) return { repriced: 0 };

    const cart = await cartService.getByUuid(uuid);
    if (!cart) return { repriced: 0 };

    const full = await cartService.getWithItems(cart.id);
    const items = (full?.items ?? []) as {
      id: number;
      product_id: number;
      variant_id: number | null;
      quantity: number;
      list_price: string | null;
      sale_price: string | null;
      modifier_selections?: unknown;
    }[];

    let repriced = 0;
    for (const item of items) {
      try {
        const pricing = await repriceConfiguredLine(
          item.product_id,
          item.variant_id,
          item.quantity,
          item.modifier_selections
        );
        const sameList = pricing.listPrice === item.list_price;
        const sameSale = (pricing.salePrice ?? null) === (item.sale_price ?? null);
        if (sameList && sameSale) continue;
        await cartItemService.updateForParent(cart.id, item.id, {
          listPrice: pricing.listPrice,
          salePrice: pricing.salePrice,
        });
        repriced++;
      } catch (e) {
        console.error("[repriceCartForSession] line skipped (non-fatal):", e);
      }
    }
    return { repriced };
  } catch (e) {
    console.error("[repriceCartForSession] failed (non-fatal):", e);
    return { repriced: 0 };
  }
}

// Request-scoped memoisation: the cart is read once per render but consumed by
// both the layout Header (badge) and the page (cart / checkout), which are two
// separate component renders in the SAME request. React's cache() dedupes those
// into a single DB read. It's per-request in-memory only — a fresh request after
// a mutation still re-reads, so there's no staleness. Not exported (a "use server"
// module may only export async functions); getCart() is the public entry point.
const readCart = cache(async () => {
  const uuid = await getCartUuid();
  if (!uuid) return null;

  const cart = await cartService.getByUuid(uuid);
  if (!cart) return null;

  const full = await cartService.getWithItems(cart.id);
  if (!full) return full;

  // A line may have been added before a restriction was applied (or before the shopper logged in
  // as a different account). Such a line is DROPPED from what we render — and rejected outright at
  // checkout (placeOrder), which is where the money moves.
  const items = full.items ?? [];
  const blocked = await blockedProductIds(items.map((i) => i.product_id));
  const visible = blocked.length === 0 ? items : items.filter((i) => !blocked.includes(i.product_id));

  // Each line carries its product's BRAND, so the cart island can re-decide brand
  // free shipping (card 88Ay7UGA) after a quantity change or a removal without a
  // route re-render — removing the last promoted line must take the "FREE" away
  // there and then. One batched lookup per cart read.
  const brands = await brandIdsForProducts(visible.map((i) => i.product_id));

  // Back-order facts per line (card 7vu2iEEZ). The SHORTFALL is not precomputed here: the
  // quantity buttons move optimistically in the client, so the row is handed the stock it can
  // have without waiting and works the message out from the quantity actually on screen. That is
  // what makes "2 of the items will be backordered" follow a click instead of lagging a round
  // trip behind it. `available_units` is null for an untracked product — no ceiling, not zero.
  const stock = await backorderFactsForProducts(visible.map((i) => i.product_id));
  return {
    ...full,
    items: visible.map((i) => {
      const facts = stock.get(i.product_id);
      return {
        ...i,
        brand_id: brands.get(i.product_id) ?? null,
        available_units: facts ? availableUnits(facts) : null,
        backorder_policy: facts ? resolveBackorderPolicy(facts.backorderPolicy) : null,
        // The SELLING UNIT, resolved once here (cards O108e4jH / zeMPVcA3), so the row can step
        // by a whole pack and say what a pack holds without a second lookup or a second opinion.
        pack_size: resolvePackSize(facts),
        pack_unit: resolvePackUnit(facts),
      };
    }),
  };
});

export async function getCart() {
  return readCart();
}
