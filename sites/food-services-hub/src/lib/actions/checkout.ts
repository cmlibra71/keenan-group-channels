"use server";

import { redirect } from "next/navigation";
import { cartService, orderService, orderItemService, CHANNEL_ID } from "@/lib/store";
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

  // Calculate totals
  const subtotal = parseFloat(cartWithItems.cartAmount ?? "0");
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
