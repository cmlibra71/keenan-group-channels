"use server";

import { redirect } from "next/navigation";
import { cartService, orderService, orderItemService, CHANNEL_ID, getEffectivePrice, productVariantService, channelSettingsService, getCheckoutSettings } from "@/lib/store";
import { getFeatureFlag, getActiveSubscription } from "@/lib/store";
import { getCartUuid, clearCartUuid } from "@/lib/cart";
import { getSession } from "@/lib/auth";

const GST_RATE = 0.1;

// Whether stored product prices already include GST.
// Set via channel setting "prices_include_tax" — defaults to false (ex-tax).
// When false: price is ex-tax, GST is added on top (total = price × 1.1)
// When true: price is inc-tax, GST is extracted (ex-tax = price / 1.1)
function calcTax(
  price: number,
  pricesIncludeTax: boolean
): { exTax: number; tax: number; incTax: number } {
  if (pricesIncludeTax) {
    const exTax = Math.round((price / (1 + GST_RATE)) * 10000) / 10000;
    const tax = Math.round((price - exTax) * 10000) / 10000;
    return { exTax, tax, incTax: price };
  }
  const tax = Math.round(price * GST_RATE * 10000) / 10000;
  const incTax = Math.round((price + tax) * 10000) / 10000;
  return { exTax: price, tax, incTax };
}

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
  const country = (formData.get("country") as string)?.trim() || "AU";
  const paymentMethod = (formData.get("paymentMethod") as string)?.trim() || "";

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
      let pricesChanged = false;
      for (const item of fullCart.items) {
        if (item.salePrice && item.listPrice) {
          const variantId = item.variantId;
          const pricingVariantId = variantId || (await productVariantService.listForParent(item.productId, { page: 1, limit: 1, sort: "id", direction: "asc" }))?.data[0]?.id;
          if (pricingVariantId) {
            const pricing = await getEffectivePrice(pricingVariantId as number, CHANNEL_ID, null);
            const oldPrice = item.salePrice;
            item.salePrice = pricing.salePrice || null;
            if (item.salePrice !== oldPrice) {
              pricesChanged = true;
            }
          }
        }
      }
      if (pricesChanged) {
        return { error: "Your membership has expired. Prices have been updated to standard pricing. Please review your order and try again." };
      }
    }
  }

  // Determine tax mode from channel settings
  let pricesIncludeTax = false;
  try {
    const taxSetting = await channelSettingsService.getByKey(CHANNEL_ID, "prices_include_tax");
    pricesIncludeTax = taxSetting.setting_value === true || taxSetting.setting_value === "true";
  } catch {
    // Default: prices are ex-tax (GST added on top)
  }

  // Calculate totals with GST
  let subtotalIncTax = 0;
  let subtotalExTax = 0;
  let subtotalTax = 0;

  for (const item of fullCart.items) {
    const unitPrice = item.salePrice ? parseFloat(item.salePrice) : parseFloat(item.listPrice);
    const linePrice = unitPrice * item.quantity;
    const { exTax, tax, incTax } = calcTax(linePrice, pricesIncludeTax);
    subtotalIncTax += incTax;
    subtotalExTax += exTax;
    subtotalTax += tax;
  }

  const totalItems = fullCart.items.reduce((sum, i) => sum + i.quantity, 0);

  // Shipping calculation
  let shippingIncTax = 0;
  let shippingExTax = 0;
  let shippingTax = 0;
  const checkoutSettings = await getCheckoutSettings();
  const isMember = !!(session && await getActiveSubscription(session.customerId));

  if (checkoutSettings.freeShippingEnabled && isMember && subtotalIncTax >= checkoutSettings.freeShippingThreshold) {
    // Free delivery for members over threshold
    shippingIncTax = 0;
  } else {
    // Flat rate shipping — configurable per channel, default $0 until shipping rates set up
    // TODO: Calculate from shipping zones/methods when configured
    shippingIncTax = 0;
  }
  // Shipping is always specified as inc-tax amount
  const shippingCalc = calcTax(shippingIncTax, true);
  shippingExTax = shippingCalc.exTax;
  shippingTax = shippingCalc.tax;

  const totalIncTax = subtotalIncTax + shippingIncTax;
  const totalExTax = subtotalExTax + shippingExTax;
  const totalTax = subtotalTax + shippingTax;

  // Create order
  const order = await orderService.create({
    channelId: CHANNEL_ID,
    customerId: session?.customerId ?? null,
    status: "pending",
    paymentMethod: paymentMethod || undefined,
    paymentStatus: "pending",
    currencyCode: cartWithItems.currencyCode,
    subtotalExTax: String(subtotalExTax),
    subtotalIncTax: String(subtotalIncTax),
    shippingCostExTax: String(shippingExTax),
    shippingCostIncTax: String(shippingIncTax),
    totalExTax: String(totalExTax),
    totalIncTax: String(totalIncTax),
    totalTax: String(totalTax),
    itemsTotal: totalItems,
    billingAddress,
  }) as { id: number; orderNumber: string };

  // Create order items
  const orderItemsData = fullCart.items.map((item) => {
    const unitPrice = item.salePrice
      ? parseFloat(item.salePrice)
      : parseFloat(item.listPrice);
    const linePrice = unitPrice * item.quantity;
    const unitCalc = calcTax(unitPrice, pricesIncludeTax);
    const lineCalc = calcTax(linePrice, pricesIncludeTax);

    return {
      productId: item.productId,
      variantId: item.variantId,
      name: item.productName,
      sku: item.productSku,
      quantity: item.quantity,
      basePrice: String(unitPrice),
      priceExTax: String(unitCalc.exTax),
      priceIncTax: String(unitCalc.incTax),
      priceTax: String(unitCalc.tax),
      baseTotal: String(linePrice),
      totalExTax: String(lineCalc.exTax),
      totalIncTax: String(lineCalc.incTax),
      totalTax: String(lineCalc.tax),
    };
  });

  await orderItemService.createManyForParent(order.id, orderItemsData);

  // Mark cart as completed
  await cartService.markCompleted(cartWithItems.id);
  await clearCartUuid();

  const pmParam = paymentMethod ? `&pm=${encodeURIComponent(paymentMethod)}` : "";
  redirect(`/checkout/confirmation?order=${order.orderNumber}${pmParam}`);
}
