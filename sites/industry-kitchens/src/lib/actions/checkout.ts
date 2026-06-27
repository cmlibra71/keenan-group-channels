"use server";

import { redirect } from "next/navigation";
import { cartService, orderService, orderItemService, CHANNEL_ID, getEffectivePrice, productVariantService, channelSettingsService, getCheckoutSettings, paymentService, accountService } from "@/lib/store";
import { getFeatureFlag, getActiveSubscription, shouldSuppressCatalogSalePrice, getSiteConfig } from "@/lib/store";
import { getCartUuid, clearCartUuid } from "@/lib/cart";
import { getSession } from "@/lib/auth";
import { sendOrderConfirmationEmail, wantsStripeTestMode, gstSplit } from "@keenan/services";

// GST split (ex/tax/inc) comes from @keenan/services `gstSplit` — the single
// source of truth for tax math, shared with the pricing engine and cart totals.

type PlaceOrderResult = {
  error?: string;
  stripe?: { clientSecret: string; orderNumber: string };
};

export async function placeOrder(
  _prev: PlaceOrderResult | null,
  formData: FormData
): Promise<PlaceOrderResult> {
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
      const suppressCatalogSale = await shouldSuppressCatalogSalePrice();
      let pricesChanged = false;
      for (const item of fullCart.items) {
        if (item.sale_price && item.list_price) {
          const oldPrice = item.sale_price;
          if (suppressCatalogSale) {
            // Member-only pricing channel: without a membership the standard
            // (RRP) price applies — never the shared catalog sale price.
            item.sale_price = null;
          } else {
            const variantId = item.variant_id;
            const pricingVariantId = variantId || (await productVariantService.listForParent(item.product_id, { page: 1, limit: 1, sort: "id", direction: "asc" }))?.data[0]?.id;
            if (pricingVariantId) {
              const pricing = await getEffectivePrice(pricingVariantId as number, CHANNEL_ID, null);
              item.sale_price = pricing.salePrice || null;
            }
          }
          if (item.sale_price !== oldPrice) {
            pricesChanged = true;
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
    const unitPrice = item.sale_price ? parseFloat(item.sale_price) : parseFloat(item.list_price);
    const linePrice = unitPrice * item.quantity;
    const { exTax, tax, incTax } = gstSplit(linePrice, pricesIncludeTax);
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

  // Shipping is quoted to the customer on the EX-tax subtotal (checkout page +
  // CheckoutForm pass cart.cartAmount), so the order must use the same basis or
  // the charged shipping diverges from the quote at tier/cap boundaries.
  if (checkoutSettings.freeShippingEnabled && isMember && subtotalExTax >= checkoutSettings.freeShippingThreshold) {
    // Free delivery for members over threshold
    shippingIncTax = 0;
  } else {
    // Calculate from shipping rate cards (zone-based flat-rate)
    try {
      const { calculateShipping } = await import("@/lib/store");
      const shippingResult = await calculateShipping(postalCode, subtotalExTax);
      if (shippingResult.success) {
        shippingIncTax = shippingResult.cost;
      }
    } catch {
      // Default to $0 if rate card not configured
      shippingIncTax = 0;
    }
  }
  // Shipping is always specified as inc-tax amount
  const shippingCalc = gstSplit(shippingIncTax, true);
  shippingExTax = shippingCalc.exTax;
  shippingTax = shippingCalc.tax;

  const totalIncTax = subtotalIncTax + shippingIncTax;
  const totalExTax = subtotalExTax + shippingExTax;
  const totalTax = subtotalTax + shippingTax;

  // Net Terms is account-gated. Resolve the logged-in customer's B2B account (by
  // email — storefront customers and B2B accounts are linked only by email) and
  // reject a net_terms submission from anyone not entitled. The UI hides the
  // option, but never trust the client. Reuse the account for the order's
  // accountId + the invoice term length. Guests (no session) never qualify.
  const netTerms = session?.email
    ? await accountService.resolveNetTermsForEmail(session.email)
    : null;
  if (paymentMethod === "net_terms" && !netTerms) {
    return { error: "Net terms aren't available on your account. Please pay by card or bank transfer." };
  }

  // Determine payment status based on payment method
  let paymentStatus = "pending";
  if (paymentMethod === "stripe") {
    paymentStatus = "awaiting_payment";
  } else if (paymentMethod === "bank_transfer") {
    paymentStatus = "pending_payment";
  } else if (paymentMethod === "net_terms") {
    paymentStatus = "net_terms";
  }

  // Tag orders created while this channel is in payments test mode so they can be
  // cleared later from the portal. Only storefront orders are tagged — Zoey/backfill
  // imports go through the service layer directly and are never marked test.
  const isTestMode = await wantsStripeTestMode(CHANNEL_ID);

  // Stamp test-mode marker + (for net-terms orders) the actual term length used,
  // so the confirmation page / invoice email show the customer's real terms.
  const orderMetafields: Record<string, unknown> = {};
  if (isTestMode) orderMetafields.test_mode = true;
  if (paymentMethod === "net_terms" && netTerms) orderMetafields.net_terms_days = netTerms.netTermsDays;

  // Create order
  const order = await orderService.create({
    channelId: CHANNEL_ID,
    customerId: session?.customerId ?? null,
    // Link the order to the B2B account when the shopper belongs to one, so the
    // backoffice can reconcile it (esp. net-terms invoices).
    ...(netTerms ? { accountId: netTerms.accountId } : {}),
    status: "pending",
    paymentMethod: paymentMethod || undefined,
    paymentStatus,
    currencyCode: cartWithItems.currency_code,
    subtotalExTax: String(subtotalExTax),
    subtotalIncTax: String(subtotalIncTax),
    shippingCostExTax: String(shippingExTax),
    shippingCostIncTax: String(shippingIncTax),
    totalExTax: String(totalExTax),
    totalIncTax: String(totalIncTax),
    totalTax: String(totalTax),
    itemsTotal: totalItems,
    billingAddress,
    ...(Object.keys(orderMetafields).length ? { metafields: orderMetafields } : {}),
  }) as { id: number; order_number: string };

  // Create order items
  const orderItemsData = fullCart.items.map((item) => {
    const unitPrice = item.sale_price
      ? parseFloat(item.sale_price)
      : parseFloat(item.list_price);
    const linePrice = unitPrice * item.quantity;
    const unitCalc = gstSplit(unitPrice, pricesIncludeTax);
    const lineCalc = gstSplit(linePrice, pricesIncludeTax);

    return {
      productId: item.product_id,
      variantId: item.variant_id,
      name: item.product_name,
      sku: item.product_sku,
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

  try {
    await orderItemService.createManyForParent(order.id, orderItemsData);
  } catch (err) {
    // Compensate so we never leave an order with no line items.
    await orderService.delete(order.id).catch(() => {});
    return { error: err instanceof Error ? err.message : "We couldn't complete your order. Please try again." };
  }

  // For Stripe: create PaymentIntent and return client secret for browser confirmation.
  // Uses the global paymentService — credentials live in store_settings.payment_gateways
  // (configured at /dashboard/settings/payments in the portal). Channel segmentation
  // happens via metadata stamped by paymentService.
  if (paymentMethod === "stripe") {
    try {
      const { clientSecret } = await paymentService.createStripePaymentIntent(order.id, {
        amount: String(totalIncTax),
        description: `Order ${order.order_number}`,
        customer_email: email,
      });

      // IMPORTANT: do NOT clear the cart here. Returning from a server action
      // triggers Next.js to refresh the current route; if the cart were already
      // empty, the /checkout page would redirect("/cart") and navigate the
      // browser away BEFORE the client can run stripe.confirmCardPayment() — the
      // PaymentIntent would be left at requires_payment_method (never charged).
      // The cart is finalised in confirmStripePayment(), once the card is
      // actually confirmed.
      return { stripe: { clientSecret, orderNumber: order.order_number } };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Failed to create payment." };
    }
  }

  // Mark cart as completed
  await cartService.markCompleted(cartWithItems.id);
  await clearCartUuid();

  // Order confirmation email — best-effort, never blocks the order. The email
  // helper redirects any @e2e.test (test) recipient to the test inbox, so test
  // orders never email a real person. Branded with THIS channel's name/logo/from
  // address (not Keenan Group) from the site config.
  try {
    const method = checkoutSettings.paymentMethods.find((m) => m.id === paymentMethod);
    const { site, channel } = await getSiteConfig();
    const storeName = site?.siteName || channel?.name || undefined;
    const siteUrl =
      site?.url || process.env.SITE_URL || `https://${process.env.NEXT_PUBLIC_SITE_DOMAIN || "chefsdepot.com.au"}`;
    await sendOrderConfirmationEmail({
      to: email,
      orderNumber: order.order_number,
      customerName: `${firstName} ${lastName}`.trim() || undefined,
      storeName,
      paymentMethod,
      total: String(totalIncTax),
      items: fullCart.items.map((i) => ({ name: i.product_name, quantity: i.quantity })),
      bankDetails: method?.bankDetails ?? null,
      // Use the customer's actual account terms for a net-terms invoice email.
      netTermsDays: paymentMethod === "net_terms" && netTerms ? netTerms.netTermsDays : (method?.netTermsDays ?? null),
      siteUrl,
      logoUrl: site?.logoUrl ?? null,
      logoAlt: site?.logoAlt ?? null,
      fromEmail: site?.fromEmail ?? null,
      testMode: isTestMode,
    });
  } catch (e) {
    console.error("[placeOrder] confirmation email failed (non-fatal):", e);
  }

  const pmParam = paymentMethod ? `&pm=${encodeURIComponent(paymentMethod)}` : "";
  redirect(`/checkout/confirmation?order=${order.order_number}${pmParam}`);
}

/**
 * Optimistic confirmation called from the client after stripe.confirmCardPayment()
 * resolves. The portal Stripe webhook is the source of truth for final payment
 * status — this is just a fast-path UI update so the confirmation page can show
 * "paid" without waiting for webhook delivery.
 */
export async function confirmStripePayment(
  orderNumber: string
): Promise<{ success: boolean; error?: string }> {
  // Finalise the cart now that the card has been confirmed (placeOrder's Stripe
  // branch deliberately left it intact — see the comment there). Cookie-based,
  // so it works for guests as well as logged-in customers; best-effort.
  try {
    const uuid = await getCartUuid();
    if (uuid) {
      const cart = await cartService.getByUuid(uuid);
      if (cart) await cartService.markCompleted(cart.id);
      await clearCartUuid();
    }
  } catch {
    /* non-fatal: payment already succeeded; the webhook is the source of truth */
  }

  // Require auth + ownership — this mutates payment status and order numbers are
  // semi-guessable. The portal webhook remains the source of truth.
  const session = await getSession();
  if (!session) return { success: false, error: "Not authenticated" };
  try {
    const orders = await orderService.list({
      page: 1, limit: 1, sort: "id", direction: "desc",
      filters: { order_number: { type: "eq", value: orderNumber } },
    });
    const order = orders.data[0] as { id: number; customer_id: number | null } | undefined;
    if (!order) return { success: false, error: "Order not found" };
    if (order.customer_id !== session.customerId) return { success: false, error: "Forbidden" };
    await orderService.update(order.id, { paymentStatus: "paid" });
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to confirm payment" };
  }
}
