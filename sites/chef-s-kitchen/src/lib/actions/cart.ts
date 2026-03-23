"use server";

import { revalidatePath } from "next/cache";
import { cartService, cartItemService, productService, productVariantService, customerService, getEffectivePrice, CHANNEL_ID } from "@/lib/store";
import { getFeatureFlag } from "@/lib/store";
import { getCartUuid, setCartUuid } from "@/lib/cart";
import { getSession } from "@/lib/auth";

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

export async function addToCart(productId: number, variantId?: number | null) {
  // Look up the product price
  const product = await productService.getById(productId) as { price: string; salePrice: string | null } | null;
  if (!product) return { error: "Product not found" };

  let listPrice = product.price;
  let salePrice = product.salePrice;

  // If a variant is selected, use variant pricing if available
  if (variantId) {
    const variant = await productVariantService.getById(variantId) as { price: string | null; salePrice: string | null } | null;
    if (variant?.price) listPrice = variant.price;
    if (variant?.salePrice) salePrice = variant.salePrice;
  }

  // Apply member pricing if enabled and user is a member
  const memberPricingEnabled = await getFeatureFlag("member_pricing_enabled");
  if (memberPricingEnabled) {
    const session = await getSession();
    if (session) {
      const customer = await customerService.getById(session.customerId) as { customerGroupId: number | null } | null;
      if (customer?.customerGroupId) {
        // Use the variant ID or find the default variant for pricing lookup
        const variantResult = variantId ? null : await productVariantService.listForParent(productId, { page: 1, limit: 1, sort: "id", direction: "asc" });
        const pricingVariantId = variantId || (variantResult?.data[0] as { id: number } | undefined)?.id;
        if (pricingVariantId) {
          const pricing = await getEffectivePrice(pricingVariantId, CHANNEL_ID, customer.customerGroupId);
          if (pricing.memberPrice) {
            salePrice = pricing.memberPrice;
          }
        }
      }
    }
  }

  const cart = await getOrCreateCart();

  // Check if this product/variant is already in the cart
  const existing = await cartItemService.findByProductVariant(cart.id, productId, variantId) as {
    id: number;
    quantity: number;
  } | null;

  if (existing) {
    const newQty = existing.quantity + 1;
    await cartItemService.updateForParent(cart.id, existing.id, {
      quantity: newQty,
    });
  } else {
    await cartItemService.createForParent(cart.id, {
      productId,
      variantId: variantId || null,
      quantity: 1,
      listPrice,
      salePrice,
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
