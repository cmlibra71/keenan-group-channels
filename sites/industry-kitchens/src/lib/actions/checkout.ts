"use server";

import { redirect } from "next/navigation";
import { cartService, orderService, orderItemService, CHANNEL_ID, getEffectivePrice, productVariantService } from "@/lib/store";
import { getFeatureFlag, getActiveSubscription } from "@/lib/store";
import { getCartUuid, clearCartUuid } from "@/lib/cart";
import { getSession } from "@/lib/auth";

export async function placeOrder(
  _prev: { error?: string } | null,
  formData: FormData
): Promise<{ error?: string }> {
  const session = await getSession();

  // Get cart
  const uuid = await getCartUuid();
  if (!uuid) return { error: "No cart found." };

  const cartWithItems = await cartService.getByUuid(uuid);
  if (!cartWithItems) return { error: "Cart not found." };

  const fullCart = await cartService.getWithItems(cartWithItems.id);
  if (!fullCart || fullCart.items.length === 0) return { error: "Cart is empty." };

  // Validate billing info
  const email = (formData.get("email") as string)?.trim();
  const firstName = (formData.get("firstName") as string)?.trim();
  const lastName = (formData.get("lastName") as string)?.trim();
  const address1 = (formData.get("address1") as string)?.trim();
  const city = (formData.get("city") as string)?.trim();
  const state = (formData.get("state") as string)?.trim();
  const postalCode = (formData.get("postalCode") as string)?.trim();
  const country = (formData.get("country") as string)?.trim() || "US";

  if (!email || !firstName || !lastName || !address1 || !city || !postalCode) {
    return { error: "Please fill in all required fields." };
  }

  const billingAddress = {
    firstName,
    lastName,
    email,
    address1,
    address2: (formData.get("address2") as string)?.trim() || "",
    city,
    state,
    postalCode,
    country,
  };

  // Re-validate subscription status — if member pricing is enabled but subscription
  // has expired since items were added, recalculate at non-member prices
  const memberPricingEnabled = await getFeatureFlag("member_pricing_enabled");
  if (memberPricingEnabled && session) {
    const activeSub = await getActiveSubscription(session.customerId);
    if (!activeSub) {
      // Subscription expired — recalculate any member-priced items at standard price
      for (const item of fullCart.items) {
        if (item.salePrice && item.listPrice) {
          const variantId = item.variantId;
          const pricingVariantId = variantId || (await productVariantService.listForParent(item.productId, { page: 1, limit: 1, sort: "id", direction: "asc" }))?.data[0]?.id;
          if (pricingVariantId) {
            const pricing = await getEffectivePrice(pricingVariantId as number, CHANNEL_ID, null);
            // Reset to non-member pricing
            item.salePrice = pricing.salePrice || null;
          }
        }
      }
    }
  }

  // Calculate totals
  const subtotal = fullCart.items.reduce((sum, item) => {
    const unitPrice = item.salePrice ? parseFloat(item.salePrice) : parseFloat(item.listPrice);
    return sum + unitPrice * item.quantity;
  }, 0);
  const totalItems = fullCart.items.reduce((sum, i) => sum + i.quantity, 0);

  // Create order
  const order = await orderService.create({
    channelId: CHANNEL_ID,
    customerId: session?.customerId ?? null,
    status: "pending",
    paymentStatus: "pending",
    currencyCode: cartWithItems.currencyCode,
    subtotalExTax: String(subtotal),
    subtotalIncTax: String(subtotal),
    totalExTax: String(subtotal),
    totalIncTax: String(subtotal),
    totalTax: "0",
    itemsTotal: totalItems,
    billingAddress,
  }) as { id: number; orderNumber: string };

  // Create order items
  const orderItemsData = fullCart.items.map((item) => {
    const unitPrice = item.salePrice
      ? parseFloat(item.salePrice)
      : parseFloat(item.listPrice);
    const lineTotal = unitPrice * item.quantity;

    return {
      productId: item.productId,
      variantId: item.variantId,
      name: item.productName,
      sku: item.productSku,
      quantity: item.quantity,
      basePrice: String(unitPrice),
      priceExTax: String(unitPrice),
      priceIncTax: String(unitPrice),
      priceTax: "0",
      baseTotal: String(lineTotal),
      totalExTax: String(lineTotal),
      totalIncTax: String(lineTotal),
      totalTax: "0",
    };
  });

  await orderItemService.createManyForParent(order.id, orderItemsData);

  // Mark cart as completed
  await cartService.markCompleted(cartWithItems.id);
  await clearCartUuid();

  redirect(`/checkout/confirmation?order=${order.orderNumber}`);
}
