"use server";

import { cache } from "react";
import { cartService, cartItemService, productService, productVariantService, CHANNEL_ID } from "@/lib/store";
import { isProductVisibleToViewer, blockedProductIds, RESTRICTED_PRODUCT_ERROR } from "@/lib/catalog-scope";
import { CART_RESTRICTED_ERROR } from "@/lib/cart/restricted-message";
import { getCartUuid, setCartUuid } from "@/lib/cart";
import { brandIdsForProducts } from "@/lib/checkout/free-shipping-brands";
import { backorderFactsForProducts, backorderFactsForProduct, type ProductBackorderFacts } from "@/lib/cart/backorder-facts";
import { availableUnits, canPurchaseQuantity, resolveBackorderPolicy } from "@keenan/services/backorder";
import { resolvePackSize, resolvePackUnit, snapToPack } from "@keenan/services/pack";
import { currentShopperForOffers } from "@/lib/promotions/shopper";
import { resolveItemPricing } from "@/lib/pricing/item-pricing";
import { bundleParts, bundleProductPath, readProductKit, resolveKitChoices, kitQuestions, type KitChoice, type ProductKit } from "@/lib/product-kit";
import { priceKitComponents } from "@/lib/pricing/kit-components";
import { resolveCartOffers, couponCapRefusal, type OfferCartLine } from "@/lib/promotions/cart-offers";
import { channelPricesIncludeTax } from "@/lib/promotions/tax-basis";
import {
  addonPanelShown,
  readProductAddons,
  resolveAddonSelection,
  addonSelectionKey,
  readStoredAddons,
  storedAddonsAsSelection,
  unansweredAddonGroups,
  withAddonSurcharge,
  type AddonSelectionInput,
  type ResolvedAddon,
} from "@keenan/services/product-addons";
import {
  buyableAddons,
  customisationDefinition,
  extrasDefinition,
} from "@/lib/product/addon-panel";
import { customisationRefusal } from "@/lib/product-customisation";

/** This shopper's cart when they already have one — never creates one. */
async function findCart(): Promise<{ id: number } | null> {
  const uuid = await getCartUuid();
  if (!uuid) return null;
  return ((await cartService.getByUuid(uuid)) as { id: number } | null) ?? null;
}

async function getOrCreateCart() {
  const existing = await findCart();
  if (existing) return existing as { id: number; uuid: string; [key: string]: unknown };

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

// The price a line stores — `resolveItemPricing` and the layers under it — lives in
// `lib/pricing/item-pricing.ts` (moved unchanged, card Tc5ekvD6) so the product page can quote a
// bundle's components at exactly what this cart charges for them.

/**
 * The paid extras a shopper ticked, resolved against the PRODUCT'S OWN definition (card
 * 0CDcCYmO).
 *
 * Nothing priced comes from the client: the page posts group/option KEYS and every amount is
 * read back out of `products.metafields.addons` here. That is the same rule the bundle build
 * follows (`addToQuote` re-resolves a kit against the product's own contents) and it is what
 * stops a hand-made request inventing a free extra or a $1 machine.
 */
async function resolveAddonsForProduct(
  productId: number,
  selection: AddonSelectionInput | null | undefined
): Promise<ResolvedAddon[]> {
  if (!selection || Object.keys(selection).length === 0) return [];
  const product = (await productService.getById(productId)) as { metafields?: unknown } | null;
  if (!product) return [];
  return resolveAddonSelection(readProductAddons(product.metafields), selection);
}

/**
 * The extras a shopper ticked AND the reason to refuse the add, decided from ONE product read.
 *
 * The provider greys the buy button while a required single-choice group is unanswered, but the
 * Product Brief's rule is that a refusal lives in the action as well ("or a stale form still
 * writes the order"), which is exactly what `refuseCartQuantity` below does for the two
 * per-product switches.
 *
 * COST, honestly: this is ONE `products` read on every Add to Cart on both storefronts. It
 * cannot be skipped when nothing is ticked, because that is precisely the case a required group
 * has to catch — so the read is unconditional and the two halves that need it share it rather
 * than taking it twice, which is what this function exists for. (An earlier comment here claimed
 * the read was "only taken when the product actually carries extras"; it never was.)
 *
 * A listing TILE posts no selection at all, and the shopper standing on a category page has no
 * panel to answer with — so that refusal names the product page instead of a control they
 * cannot see.
 */
type AddProductRow = {
  metafields?: unknown;
  url_path?: string | null;
  price?: string | null;
  sale_price?: string | null;
  hide_price?: boolean | null;
  name?: string | null;
};

async function readAddonsForAdd(
  productId: number,
  variantId: number | null | undefined,
  selection: AddonSelectionInput | null | undefined
): Promise<{ resolved: ResolvedAddon[]; refusal: string | null; product: AddProductRow | null }> {
  const product = (await productService.getById(productId)) as AddProductRow | null;
  const definition = readProductAddons(product?.metafields);
  if (!definition) return { resolved: [], refusal: null, product };

  // WOULD THE PAGE HAVE OFFERED A PANEL? The same predicate the provider draws it with
  // (`addonPanelShown`), re-made here against the product record because a stale tab or a
  // hand-posted action must not slip past it in EITHER direction: on a product whose price is
  // hidden or zero the panel is not on screen, so there is no required group to answer and no
  // surcharge to charge — refusing over a control the shopper cannot see is the failure
  // `sf-product-page` forbids, and resolving the picks anyway would charge extras the page
  // showed as adding nothing.
  let panelShown = addonPanelShown({
    addons: definition,
    hidePrice: product?.hide_price,
    price: product?.price,
    salePrice: product?.sale_price,
  });
  // A variant product may carry no price of its own; the page reads the ACTIVE variant's.
  // Only taken in that case, so the ordinary add keeps the one product read it always took.
  if (!panelShown && product?.hide_price !== true && variantId) {
    const variant = (await productVariantService.getById(variantId)) as
      | { price: string | null; sale_price: string | null }
      | null;
    panelShown = addonPanelShown({
      addons: definition,
      price: variant?.price,
      salePrice: variant?.sale_price,
    });
  }
  // PRICED groups drop out with their panel; FREE-TEXT groups do NOT (card kyMjCmAw). The
  // price rule above exists to stop a surcharge republishing a suppressed price or pricing a
  // quote-only machine at its accessories — a typed answer carries no money at all, so neither
  // reason reaches it, and gating it here would make the Instructions box unreachable on the
  // one product it was built for.
  const buyable = buyableAddons(definition, panelShown);
  if (!buyable) return { resolved: [], refusal: null, product };
  const posted = selection != null;
  // Refused SEPARATELY by kind, because the sentence has to fit the control: you CHOOSE a
  // hopper and you FILL IN an instruction, and both sentences reach a customer. Priced first,
  // so 0CDcCYmO's own wording is unchanged on every product that carries one.
  const missing = unansweredAddonGroups(
    extrasDefinition(definition, panelShown),
    posted ? selection : {}
  );
  if (missing.length > 0) {
    return {
      resolved: [],
      refusal: posted
        ? `Please choose ${missing.join(" and ")} before adding this to your cart.`
        : `Open this product's page to choose ${missing.join(" and ")} before adding it to your cart.`,
      product,
    };
  }
  const typedRefusal = customisationRefusal(
    customisationDefinition(definition),
    posted ? selection : undefined,
    "cart"
  );
  if (typedRefusal) return { resolved: [], refusal: typedRefusal, product };
  return {
    resolved: posted ? resolveAddonSelection(buyable, selection) : [],
    refusal: null,
    product,
  };
}

/**
 * The two per-product refusals (card 7vu2iEEZ), enforced HERE and not only in the page, because a
 * stale tab or a hand-posted action would otherwise book something staff switched off.
 *
 * Stock alone never refuses: an empty shelf is a back order, and the cart says so. Only a product
 * explicitly set to "No - do not let this product be purchased when Out of Stock" is turned away,
 * and only for the units that are not on the shelf.
 */
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

export async function addToCart(
  productId: number,
  variantId?: number | null,
  quantity: number = 1,
  /** The paid extras ticked on the product page (card 0CDcCYmO): group key -> option keys.
   *  Keys only — every price is read back from the product's own definition here. */
  addons?: AddonSelectionInput,
  /**
   * A BUNDLE's build (card Tc5ekvD6): group names + product ids, exactly as `addToQuote` takes
   * them. Re-resolved here against the product's own kit — never a price from the client — and
   * `undefined`/`null` means the caller had no picker (a listing tile), which never builds one.
   */
  kitChoices?: KitChoice[] | null
) {
  // "What we show is what we accept" — a product restricted away from this shopper is not addable,
  // even by poking the action directly (the listing/PDP guards are UX; THIS is the enforcement).
  if (!(await isProductVisibleToViewer(productId))) return { error: RESTRICTED_PRODUCT_ERROR };

  // The picks and the required-group refusal come out of ONE product read (Product Brief §3
  // refuses in the action, not only in the page; speed on this path is stakeholder-visible). The
  // same row answers "is this a bundle", so a bundle costs the ordinary add no extra read.
  const {
    resolved: resolvedAddons,
    refusal: addonRefusal,
    product,
  } = await readAddonsForAdd(productId, variantId, addons);
  if (addonRefusal) return { error: addonRefusal };

  const kit = readProductKit(product?.metafields);
  if (kit?.kind === "bundle") {
    return addBundleToCart({ productId, product, kit, quantity, baseAddons: resolvedAddons, kitChoices });
  }

  const cart = await getOrCreateCart();
  const lineError = await writeCartLine(cart.id, productId, variantId, quantity, resolvedAddons);
  if (lineError) return { error: lineError };
  return { success: true, cartCount: await countCartItems(cart.id) };
}

/**
 * Put ONE product line in the cart — or add to the matching line already there — at the price
 * the cart stores for it. Every refusal it can make is returned as the sentence the shopper
 * reads; `null` means the line was written. Shared by the ordinary add and the bundle add, so a
 * bundle component is priced, pack-snapped, stock-checked and matched exactly like the same
 * product added on its own page.
 */
async function writeCartLine(
  cartId: number,
  productId: number,
  variantId: number | null | undefined,
  quantity: number,
  resolvedAddons: ResolvedAddon[]
): Promise<string | null> {
  const plan = await planCartLine(cartId, productId, variantId, quantity, resolvedAddons);
  if (typeof plan === "string") return plan;
  await commitCartLine(cartId, plan);
  return null;
}

type CartLineRow = {
  id: number;
  product_id: number;
  variant_id: number | null;
  quantity: number;
  modifier_selections?: unknown;
};

/** Everything `writeCartLine` decides before it writes: which line (if any) it adds to, the
 *  final quantity and the price for it. Split out so a BUNDLE can plan every one of its lines
 *  against the cart as it stands — refusing on the MERGED quantity — before it writes any. */
interface CartLinePlan {
  productId: number;
  variantId: number | null | undefined;
  resolvedAddons: ResolvedAddon[];
  existing: CartLineRow | undefined;
  finalQty: number;
  pricing: { listPrice: string; salePrice: string | null };
}

/**
 * Plan ONE product line — or the addition to the matching line already there. Returns the
 * sentence the shopper reads when it is refused. `cartId` null means the shopper has no cart yet,
 * so nothing is already in it. Writes nothing.
 */
async function planCartLine(
  cartId: number | null,
  productId: number,
  variantId: number | null | undefined,
  quantity: number,
  resolvedAddons: ResolvedAddon[]
): Promise<CartLinePlan | string> {
  const selectionKey = addonSelectionKey(resolvedAddons);

  // Is this product/variant WITH THESE EXTRAS already in the cart?
  //
  // A configuration is what identifies a line now, not the product alone: two Hallde machines
  // with different blades are two lines, and adding the same configuration twice is one line
  // of two. Matching on product+variant alone (which is all `findByProductVariant` can do)
  // would fold a second configuration into the first and charge the first one's extras twice.
  const matchesThisConfiguration = (i: CartLineRow) =>
    i.product_id === productId &&
    (i.variant_id ?? null) === (variantId ?? null) &&
    addonSelectionKey(readStoredAddons(i.modifier_selections)) === selectionKey;

  // The ordinary add — no extras ticked, which is every product but a handful — takes the
  // single-row lookup it always took rather than the cart's four-table join. Speed on this path
  // is stakeholder-visible (Tim, 7 Aug demo) and this action runs on every Add to Cart on both
  // storefronts. It falls through to the full read the moment the cheap answer could be wrong:
  // `findByProductVariant` is LIMIT 1 with no ordering, so if the row it happens to return is a
  // CONFIGURED line, a plain line of the same product may still be sitting behind it.
  let existing: CartLineRow | undefined;
  if (cartId === null) {
    existing = undefined;
  } else if (selectionKey === "") {
    const cart = { id: cartId };
    const cheap = (await cartItemService.findByProductVariant(
      cart.id,
      productId,
      variantId
    )) as CartLineRow | null;
    if (!cheap) existing = undefined;
    else if (readStoredAddons(cheap.modifier_selections).length === 0) existing = cheap;
    else {
      const full = await cartService.getWithItems(cart.id);
      existing = ((full?.items ?? []) as CartLineRow[]).find(matchesThisConfiguration);
    }
  } else {
    const full = await cartService.getWithItems(cartId);
    existing = ((full?.items ?? []) as CartLineRow[]).find(matchesThisConfiguration);
  }

  const wantedQty = existing ? existing.quantity + Math.max(1, quantity) : Math.max(1, quantity);

  const facts = await backorderFactsForProduct(productId);
  // A product sold by the carton is bought by the carton, wherever the add came from (cards
  // O108e4jH / zeMPVcA3). The product page already steps in whole packs; this covers the listing
  // tile, a stale form and a direct call — snapping UP, so a shopper is never handed less than
  // they asked for. On everything else `snapToPack` returns the quantity untouched.
  const packSize = resolvePackSize(facts);
  const finalQty = snapToPack(wantedQty, packSize);

  const refusal = await refuseCartQuantity(productId, finalQty, facts);
  if (refusal) return refusal;

  // Price for the FINAL quantity (so crossing a bulk tier re-prices the whole line), then the
  // extras on top — a bulk break is a discount off the PRODUCT and must never discount the
  // accessories with it.
  let pricing: { listPrice: string; salePrice: string | null };
  try {
    pricing = withAddonSurcharge(
      await resolveItemPricing(productId, variantId, finalQty),
      resolvedAddons
    );
  } catch {
    return "Product not found";
  }

  return { productId, variantId, resolvedAddons, existing, finalQty, pricing };
}

/** Write a planned line. */
async function commitCartLine(cartId: number, plan: CartLinePlan): Promise<void> {
  const { productId, variantId, resolvedAddons, existing, finalQty, pricing } = plan;
  const cart = { id: cartId };
  if (existing) {
    await cartItemService.updateForParent(cart.id, existing.id, {
      quantity: finalQty,
      listPrice: pricing.listPrice,
      salePrice: pricing.salePrice,
      // Same guard as `updateCartItem` and the reprice: a line that never carried extras is left
      // alone, because `modifier_selections` also holds the variant-modifier OBJECT the REST API
      // writes and this card does not own it. Stamping `[]` here on a plain re-add would erase it.
      ...(readStoredAddons(existing.modifier_selections).length > 0 || resolvedAddons.length > 0
        ? { modifierSelections: resolvedAddons }
        : {}),
    });
  } else {
    await cartItemService.createForParent(cart.id, {
      productId,
      variantId: variantId || null,
      quantity: finalQty,
      listPrice: pricing.listPrice,
      salePrice: pricing.salePrice,
      modifierSelections: resolvedAddons,
    });
  }
}

/** A bundle build that cannot go through the cart, in words the shopper can act on. */
const BUNDLE_QUOTE_ONLY = "This configuration is priced by our team — please add it to a quote instead.";

/**
 * A BUNDLE into the cart (card Tc5ekvD6 — Zoey's bundled product with dynamic pricing).
 *
 * The build is re-resolved against the product's OWN kit, never taken from the client, and it is
 * written as the components themselves: the bundle's own line only when the bundle carries a
 * price of its own (an author who priced the main machine on the bundle, as on the Hoshizaki
 * KMD-270AB), then one line per chosen component at the quantity the kit names times the
 * quantity asked for. So the order lines, the stock, the back-order note and every SKU report
 * carry the components' own SKUs — the reporting ground `sf-bundle-page` decided for the
 * promotion bundles — and each is charged exactly what the same product costs this shopper on
 * its own, which is the figure the product page printed.
 *
 * EVERY line is PLANNED against the cart as it stands — so a part already in the basket is
 * stock-checked at the quantity it will actually reach — before the first line is written, so a
 * build that cannot be sold leaves the basket as it was rather than half-added (Product Brief: no
 * record from a failed save).
 */
async function addBundleToCart(args: {
  productId: number;
  product: AddProductRow | null;
  kit: ProductKit;
  quantity: number;
  baseAddons: ResolvedAddon[];
  kitChoices: KitChoice[] | null | undefined;
}): Promise<{ error: string; productPath?: string } | { success: true; cartCount: number }> {
  const { productId, product, kit, baseAddons, kitChoices } = args;
  const quantity = Math.max(1, Math.floor(Number(args.quantity) || 1));

  // A tile, a rail or a hand-made post carries no build. There is nothing on that screen to
  // choose in, so the sentence sends the shopper to the page that has the pickers.
  if (kitChoices == null) {
    const questions = kitQuestions(kit);
    const productPath = bundleProductPath(product?.url_path);
    return {
      error: questions.length
        ? `Open this product's page to choose ${questions.join(" and ")} before adding it to your cart.`
        : "Open this product's page to choose your options before adding it to your cart.",
      // The tile button takes the shopper there (builder/master-leaves.tsx).
      ...(productPath ? { productPath } : {}),
    };
  }
  const build = resolveKitChoices(kit, kitChoices);
  if (!build) return { error: "Choose an option in every required group before adding this to your cart." };

  // The bundle's own switches, exactly as its own buy box reads them (7vu2iEEZ).
  const baseFacts = await backorderFactsForProduct(productId);
  if (baseFacts?.restrictAddToCart) return { error: CART_RESTRICTED_ERROR };
  if (product?.hide_price === true) return { error: BUNDLE_QUOTE_ONLY };

  // The bundle's OWN price is part of the build only when it has one.
  let basePriced = false;
  try {
    const base = await resolveItemPricing(productId, null, quantity);
    basePriced = parseFloat(base.salePrice ?? base.listPrice) > 0;
  } catch {
    return { error: "Product not found" };
  }

  const components = bundleParts(build, quantity);
  if (!basePriced && components.length === 0) {
    return { error: "Choose at least one item before adding this bundle to your cart." };
  }

  // Every chosen component must be buyable online HERE and at a price — the same test that
  // decided whether the page printed a price beside it (`priceKitComponents`).
  const prices = await priceKitComponents(kit);
  for (const c of components) {
    if (prices[c.productId] == null) return { error: BUNDLE_QUOTE_ONLY };
  }
  for (const c of components) {
    // A component that asks its OWN question (a required extras group) cannot be answered from
    // this page; the bundle goes to a rep instead of arriving without the answer.
    const own = await readAddonsForAdd(c.productId, null, undefined);
    if (own.refusal) return { error: BUNDLE_QUOTE_ONLY };
  }

  // Plan every line against the basket AS IT STANDS — a part already there is refused on the
  // quantity it would reach (a deny-backorder product with 1 on the shelf and 1 already in the
  // cart cannot take another), not on the kit quantity alone — and only then write.
  const existingCart = await findCart();
  const plans: CartLinePlan[] = [];
  if (basePriced) {
    const plan = await planCartLine(existingCart?.id ?? null, productId, null, quantity, baseAddons);
    if (typeof plan === "string") return { error: plan };
    plans.push(plan);
  }
  for (const c of components) {
    const plan = await planCartLine(existingCart?.id ?? null, c.productId, null, c.quantity, []);
    if (plan === CART_RESTRICTED_ERROR) return { error: BUNDLE_QUOTE_ONLY };
    if (typeof plan === "string") return { error: `${c.name}: ${plan}` };
    plans.push(plan);
  }

  const cart = existingCart ?? (await getOrCreateCart());
  for (const plan of plans) await commitCartLine(cart.id, plan);
  return { success: true, cartCount: await countCartItems(cart.id) };
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
    // The re-resolved picks, which are written back with the price they produced — see below.
    let lineAddons: ResolvedAddon[] = [];
    // Whether this line has anything to do with paid extras AT ALL. A line that never carried
    // any is left alone: `modifier_selections` also holds the variant-modifier OBJECT the REST
    // API writes, and stamping `[]` over one would destroy a record this card never owned.
    const storedAddons = readStoredAddons(item.modifier_selections);
    try {
      // The line's own extras ride the new quantity too (card 0CDcCYmO). They are RE-RESOLVED
      // from the product's current definition rather than read off the line, so an extra staff
      // have re-priced or withdrawn moves here exactly as the catalogue price does — the stored
      // picks are the record of WHAT was chosen, never of what it costs.
      //
      // The quantity that reaches BOTH is `nextQuantity`, the pack-snapped one (cards O108e4jH /
      // zeMPVcA3): the quantity break the price is read on and the quantity the line is written
      // with must be the same number, or a pack product prices on 5 and is stored as 6.
      lineAddons = await resolveAddonsForProduct(
        item.product_id,
        storedAddonsAsSelection(storedAddons)
      );
      pricing = withAddonSurcharge(
        await resolveItemPricing(item.product_id, item.variant_id, nextQuantity),
        lineAddons
      );
    } catch {
      pricing = null;
    }

    await cartItemService.updateForParent(
      cart.id,
      itemId,
      pricing
        ? {
            quantity: nextQuantity,
            listPrice: pricing.listPrice,
            salePrice: pricing.salePrice,
            // The RECORD moves with the money. An extra staff withdrew leaves the price here,
            // and leaving the stored pick behind would print "+ Slicers: Slicer 4mm" on a cart
            // row that was not charged for it — and stamp it onto `order_items.product_options`
            // at checkout, where a rep or the warehouse reads it as a paid accessory.
            ...(storedAddons.length > 0 || lineAddons.length > 0
              ? { modifierSelections: lineAddons }
              : {}),
          }
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
        // Signing in re-prices the whole line, extras included (card 0CDcCYmO): the surcharge
        // is part of what this line is charged, so a re-price that dropped it would show the
        // shopper one price and charge another — the exact failure this pass exists to stop.
        const lineAddons = await resolveAddonsForProduct(
          item.product_id,
          storedAddonsAsSelection(readStoredAddons(item.modifier_selections))
        );
        const pricing = withAddonSurcharge(
          await resolveItemPricing(item.product_id, item.variant_id, item.quantity),
          lineAddons
        );
        const sameList = pricing.listPrice === item.list_price;
        const sameSale = (pricing.salePrice ?? null) === (item.sale_price ?? null);
        // The picks are compared too, not only the two amounts: an extra staff withdrew and one
        // they re-priced by exactly what another gained both leave the money where it was while
        // the stored record is now wrong, and that record is what the cart prints and what the
        // checkout stamps onto the order line.
        const storedAddons = readStoredAddons(item.modifier_selections);
        const sameAddons = addonSelectionKey(lineAddons) === addonSelectionKey(storedAddons);
        if (sameList && sameSale && sameAddons) continue;
        await cartItemService.updateForParent(cart.id, item.id, {
          listPrice: pricing.listPrice,
          salePrice: pricing.salePrice,
          // Left alone on a line that never carried extras — the column also holds the
          // variant-modifier object the REST API writes, which is not ours to overwrite.
          ...(storedAddons.length > 0 || lineAddons.length > 0
            ? { modifierSelections: lineAddons }
            : {}),
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

  // OFFERS (card p6YVxc4P). The carton bands, the cross-range kicker and the fixed
  // bundles are worked out from the lines that will actually be charged — the same
  // call `placeOrder` makes before it bills, so the cart, the checkout summary and
  // the order can never name three different numbers. Never throws: a promotion
  // that cannot be read leaves the basket at full price.
  const offers = await resolveCartOffers(visible as unknown as OfferCartLine[], {
    channelId: CHANNEL_ID,
    couponCodes: ((full as { coupon_codes?: string[] | null }).coupon_codes ?? []) as string[],
    pricesIncludeTax: await channelPricesIncludeTax(),
    // WHO is buying: the coupon per-customer cap and customer-group offers are judged against
    // THIS shopper, so the basket shows exactly what the till will charge.
    ...(await currentShopperForOffers()),
  });
  const offerByItem = new Map(offers.lines.map((l) => [l.itemId, l]));

  return {
    ...full,
    offers,
    items: visible.map((i) => {
      const facts = stock.get(i.product_id);
      return {
        ...i,
        brand_id: brands.get(i.product_id) ?? null,
        available_units: facts ? availableUnits(facts) : null,
        backorder_policy: facts ? resolveBackorderPolicy(facts.backorderPolicy) : null,
        // Card 1sgz4B3v: a line whose product staff switched off for online
        // ordering SAYS SO on the row and cannot be increased, so the shopper
        // told at checkout to review their cart has something to find. Removing
        // or reducing it stays allowed — see `refuseCartQuantity`.
        restrict_add_to_cart: facts?.restrictAddToCart === true,
        // The SELLING UNIT, resolved once here (cards O108e4jH / zeMPVcA3), so the row can step
        // by a whole pack and say what a pack holds without a second lookup or a second opinion.
        pack_size: resolvePackSize(facts),
        pack_unit: resolvePackUnit(facts),
        // What this line took from an offer, so the row can show it without a
        // second evaluation (card p6YVxc4P). Absent on a line that took nothing.
        offer_discount: offerByItem.get(i.id)?.discount ?? null,
        offer_name: offerByItem.get(i.id)?.promotionName ?? null,
        offer_percent: offerByItem.get(i.id)?.percent ?? null,
      };
    }),
  };
});

/**
 * Put a coupon code on the cart.
 *
 * THE CAPS ARE JUDGED HERE, not only at redemption. `max_uses` and
 * `max_uses_per_customer` are read while the offer is evaluated
 * (`evaluateBasketPromotions`), so a shopper past "one use per customer" is
 * refused the code now instead of being billed the discounted total and having
 * the redemption fail into a server log afterwards — which is what used to
 * happen, and which made the card's "one use per customer" true nowhere that
 * moved money. `couponService.redeem` still re-reads them under a row lock,
 * because only the lock can settle two tabs racing for the last use.
 *
 * A code that discounts nothing is REFUSED rather than stored, so the shopper is
 * told now instead of discovering at the till that it did nothing. This is the
 * missing half of the coupon path the register recorded as a conflict: the cart
 * carried codes and `placeOrder` redeemed them with a $0 discount, because no
 * screen could set one and nothing evaluated them.
 */
export async function applyCouponCode(rawCode: string): Promise<{ success?: true; error?: string; discount?: number }> {
  const code = (rawCode ?? "").trim().toUpperCase();
  if (!code) return { error: "Enter a promotion code." };
  try {
    const uuid = await getCartUuid();
    if (!uuid) return { error: "Your cart is empty." };
    const cart = await cartService.getByUuid(uuid);
    if (!cart) return { error: "Your cart is empty." };

    const existing = (((cart as { coupon_codes?: string[] | null }).coupon_codes ?? []) as string[])
      .map((c) => (c ?? "").toUpperCase())
      .filter((c) => c !== "");
    if (existing.includes(code)) return { error: "That code is already applied." };

    const full = await cartService.getWithItems(cart.id);
    const items = (full?.items ?? []) as unknown as OfferCartLine[];
    const pricesIncludeTax = await channelPricesIncludeTax();
    const shopper = await currentShopperForOffers();

    const before = await resolveCartOffers(items, {
      channelId: CHANNEL_ID,
      couponCodes: existing,
      pricesIncludeTax,
      ...shopper,
    });
    const after = await resolveCartOffers(items, {
      channelId: CHANNEL_ID,
      couponCodes: [...existing, code],
      pricesIncludeTax,
      ...shopper,
    });
    if (after.totalDiscount <= before.totalDiscount || !after.appliedCouponCodes.includes(code)) {
      // Say the true reason where there is one: a code the shopper has already
      // used is not a code that "doesn't apply to what's in your cart".
      const capped = await couponCapRefusal(code, { contactId: shopper.contactId, email: shopper.email });
      return { error: capped ?? "That code doesn't apply to what's in your cart." };
    }

    await cartService.update(cart.id, { couponCodes: [...existing, code] });
    return { success: true, discount: after.totalDiscount - before.totalDiscount };
  } catch (e) {
    console.error("[applyCouponCode] failed:", e);
    return { error: "We couldn't apply that code. Please try again." };
  }
}

/** Take a coupon code back off the cart. Removing one that isn't there is a no-op success. */
export async function removeCouponCode(rawCode: string): Promise<{ success?: true; error?: string }> {
  const code = (rawCode ?? "").trim().toUpperCase();
  try {
    const uuid = await getCartUuid();
    if (!uuid) return { success: true };
    const cart = await cartService.getByUuid(uuid);
    if (!cart) return { success: true };
    const existing = (((cart as { coupon_codes?: string[] | null }).coupon_codes ?? []) as string[])
      .map((c) => (c ?? "").toUpperCase())
      .filter((c) => c !== "");
    await cartService.update(cart.id, { couponCodes: existing.filter((c) => c !== code) });
    return { success: true };
  } catch (e) {
    console.error("[removeCouponCode] failed:", e);
    return { error: "We couldn't remove that code. Please try again." };
  }
}

export async function getCart() {
  return readCart();
}
