"use server";

import { revalidatePath } from "next/cache";
import { cartService, cartItemService, productService, productVariantService, customerService, bulkPricingRuleService, getEffectivePrice, CHANNEL_ID } from "@/lib/store";
import { getFeatureFlag, getActiveSubscription, shouldSuppressCatalogSalePrice } from "@/lib/store";
import { getCartUuid, setCartUuid } from "@/lib/cart";
import { getSession } from "@/lib/auth";
import { pickBestBulkUnit, layerCartPrice } from "@/lib/pricing/cart-pricing";

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
  quantity: number
): Promise<{ listPrice: string; salePrice: string | null }> {
  const product = (await productService.getById(productId)) as { price: string; sale_price: string | null } | null;
  if (!product) throw new Error("Product not found");

  let listPrice = product.price;
  // NOTE: getById returns snake_case — read sale_price (reading salePrice silently
  // yielded undefined, so IK was charging RRP instead of its public sale price).
  let catalogSalePrice: string | null = product.sale_price ?? null;

  if (variantId) {
    const variant = (await productVariantService.getById(variantId)) as { price: string | null; sale_price: string | null } | null;
    if (variant?.price) listPrice = variant.price;
    if (variant?.sale_price) catalogSalePrice = variant.sale_price;
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
      const activeSub = await getActiveSubscription(session.customerId);
      if (activeSub) {
        const customer = (await customerService.getById(session.customerId)) as { customer_group_id: number | null } | null;
        if (customer?.customer_group_id) {
          const variantResult = variantId ? null : await productVariantService.listForParent(productId, { page: 1, limit: 1, sort: "id", direction: "asc" });
          const pricingVariantId = variantId || (variantResult?.data[0] as { id: number } | undefined)?.id;
          if (pricingVariantId) {
            const pricing = await getEffectivePrice(pricingVariantId, CHANNEL_ID, customer.customer_group_id, quantity);
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

export async function addToCart(productId: number, variantId?: number | null, quantity: number = 1) {
  const cart = await getOrCreateCart();

  // Check if this product/variant is already in the cart
  const existing = await cartItemService.findByProductVariant(cart.id, productId, variantId) as {
    id: number;
    quantity: number;
  } | null;

  const finalQty = existing ? existing.quantity + Math.max(1, quantity) : Math.max(1, quantity);

  // Price for the FINAL quantity (so crossing a bulk tier re-prices the whole line).
  let pricing: { listPrice: string; salePrice: string | null };
  try {
    pricing = await resolveItemPricing(productId, variantId, finalQty);
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
    });
  }

  revalidatePath("/", "layout");
  return { success: true };
}

export async function updateCartItem(itemId: number, quantity: number) {
  const uuid = await getCartUuid();
  if (!uuid) return { error: "No cart" };

  const cart = await cartService.getByUuid(uuid);
  if (!cart) return { error: "Cart not found" };

  if (quantity <= 0) {
    await cartItemService.deleteForParent(cart.id, itemId);
    revalidatePath("/", "layout");
    return { success: true };
  }

  // Re-price the line for the new quantity so bulk tiers are applied/removed as
  // the quantity crosses a break (the stored salePrice carries the effective price).
  const full = await cartService.getWithItems(cart.id);
  // getWithItems returns snake_case rows — read product_id / variant_id (reading
  // the camelCase keys yielded undefined, so re-pricing threw on every change).
  const item = full?.items.find((i: { id: number }) => i.id === itemId) as
    | { id: number; product_id: number; variant_id: number | null }
    | undefined;

  if (item) {
    // Re-pricing can throw (product lookup); never let it block the quantity
    // change — fall back to updating just the quantity, matching addToCart.
    try {
      const pricing = await resolveItemPricing(item.product_id, item.variant_id, quantity);
      await cartItemService.updateForParent(cart.id, itemId, {
        quantity,
        listPrice: pricing.listPrice,
        salePrice: pricing.salePrice,
      });
    } catch {
      await cartItemService.updateForParent(cart.id, itemId, { quantity });
    }
  } else {
    await cartItemService.updateForParent(cart.id, itemId, { quantity });
  }

  revalidatePath("/", "layout");
  return { success: true };
}

export async function removeCartItem(itemId: number) {
  return updateCartItem(itemId, 0);
}

export async function getCart() {
  const uuid = await getCartUuid();
  if (!uuid) return null;

  const cart = await cartService.getByUuid(uuid);
  if (!cart) return null;

  return cartService.getWithItems(cart.id);
}
