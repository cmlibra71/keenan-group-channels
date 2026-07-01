"use server";

import { redirect } from "next/navigation";
import { cartService, cartItemService, orderService, orderItemService, orderShippingAddressService, CHANNEL_ID, getEffectivePrice, productVariantService, channelSettingsService, getCheckoutSettings, paymentService, couponService } from "@/lib/store";
import { getFeatureFlag, getActiveSubscription, shouldSuppressCatalogSalePrice, getSiteConfig } from "@/lib/store";
import { getCartUuid, clearCartUuid } from "@/lib/cart";
import { getSession } from "@/lib/auth";
import { sendOrderConfirmationEmail, wantsStripeTestMode } from "@keenan/services";
import { buildLineItems, withShipping, determinePaymentStatus } from "@/lib/checkout/order-draft";
import { qualifiesForFreeDelivery } from "@/lib/checkout/shipping";
import { siteBaseUrl } from "@/lib/seo";
import { resolveNetTermsEntitlement } from "@/lib/checkout/net-terms";

// Pricing/tax/payment-status computation lives in the pure order-draft module
// (lib/checkout/order-draft.ts), which delegates GST math to @keenan/services
// `gstSplit`. placeOrder is the imperative shell: it fetches, runs the impure
// shipping-rate lookup, then persists and fires side-effects.

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
      const repriced: typeof fullCart.items = [];
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
            repriced.push(item);
          }
        }
      }
      if (pricesChanged) {
        // Persist the recomputed standard prices to the cart BEFORE returning, so
        // the shopper's retry actually succeeds at standard pricing. Previously the
        // new prices lived only in memory and were discarded, so every retry hit
        // the same "prices updated" wall forever.
        for (const item of repriced) {
          try {
            await cartItemService.updateForParent(cartWithItems.id, item.id, { salePrice: item.sale_price });
          } catch (e) {
            console.error("[placeOrder] failed to persist re-priced cart item (non-fatal):", e);
          }
        }
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

  // Calculate line items + subtotal (pure; GST math delegated to gstSplit).
  const { subtotal, itemsTotal: totalItems, lineItems } = buildLineItems(
    fullCart.items,
    pricesIncludeTax
  );
  const subtotalIncTax = subtotal.incTax;
  const subtotalExTax = subtotal.exTax;

  // Shipping calculation
  let shippingIncTax = 0;
  const checkoutSettings = await getCheckoutSettings();
  const isMember = !!(session && await getActiveSubscription(session.customerId));

  // Shipping is quoted to the customer on the EX-tax subtotal (checkout page +
  // CheckoutForm pass cart.cartAmount), so the order must use the same basis or
  // the charged shipping diverges from the quote at tier/cap boundaries.
  if (
    qualifiesForFreeDelivery({
      enabled: checkoutSettings.freeShippingEnabled,
      isMember,
      amount: subtotalExTax,
      threshold: checkoutSettings.freeShippingThreshold,
    })
  ) {
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
  // Shipping is always specified as inc-tax amount; roll it into the order total.
  const { shipping, total } = withShipping(subtotal, shippingIncTax);
  const shippingExTax = shipping.exTax;
  const shippingTax = shipping.tax;
  const totalIncTax = total.incTax;
  const totalExTax = total.exTax;
  const totalTax = total.tax;

  // Net Terms is account-gated. Resolve the logged-in customer's entitlement (the
  // SAME decision the checkout page uses to show the option, incl. the
  // self-registered/unverified fail-closed rule) and reject a net_terms submission
  // from anyone not entitled — never trust the client. Reuse the account for the
  // order's accountId + the invoice term length. Guests (no session) never qualify.
  const netTerms = await resolveNetTermsEntitlement(session);
  if (paymentMethod === "net_terms" && !netTerms) {
    return { error: "Net terms aren't available on your account. Please pay by card or bank transfer." };
  }

  // Determine payment status based on payment method
  const paymentStatus = determinePaymentStatus(paymentMethod);

  // Tag orders created while this channel is in payments test mode so they can be
  // cleared later from the portal. Only storefront orders are tagged — Zoey/backfill
  // imports go through the service layer directly and are never marked test.
  const isTestMode = await wantsStripeTestMode(CHANNEL_ID);

  // Stamp test-mode marker + (for net-terms orders) the actual term length used,
  // so the confirmation page / invoice email show the customer's real terms.
  const orderMetafields: Record<string, unknown> = {};
  if (isTestMode) orderMetafields.test_mode = true;
  if (paymentMethod === "net_terms" && netTerms) orderMetafields.net_terms_days = netTerms.netTermsDays;
  // Stamp the cart uuid on card orders so a retry/double-submit can find and reuse
  // the existing awaiting_payment order instead of creating a duplicate (see below).
  if (paymentMethod === "stripe") orderMetafields.cart_uuid = uuid;

  // Idempotency guard for card payments: if THIS cart already has an open, unpaid
  // Stripe order (the shopper hit "Pay" twice, or retried after a network blip),
  // reuse it rather than creating a second orphan awaiting_payment order. We match
  // on the cart uuid stamped in order metafields. createStripePaymentIntent is
  // itself idempotent on (orderId, amount), so re-confirming returns a usable
  // client secret for the same order.
  if (paymentMethod === "stripe") {
    try {
      const open = await orderService.list({
        page: 1,
        limit: 20,
        sort: "id",
        direction: "desc",
        filters: {
          channel_id: { type: "eq", value: CHANNEL_ID },
          payment_status: { type: "eq", value: "awaiting_payment" },
          ...(session?.customerId ? { customer_id: { type: "eq", value: session.customerId } } : {}),
        },
      });
      const existing = (open.data as Array<{ id: number; order_number: string; metafields?: Record<string, unknown> | null }>).find(
        (o) => (o.metafields ?? {})?.cart_uuid === uuid
      );
      if (existing) {
        const { clientSecret } = await paymentService.createStripePaymentIntent(existing.id, {
          amount: String(totalIncTax),
          description: `Order ${existing.order_number}`,
          customer_email: email,
        });
        return { stripe: { clientSecret, orderNumber: existing.order_number } };
      }
    } catch (e) {
      console.error("[placeOrder] idempotency reuse check failed (non-fatal):", e);
    }
  }

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

  // Create order items (line items precomputed by buildLineItems above)
  try {
    await orderItemService.createManyForParent(order.id, lineItems);
  } catch (err) {
    // Compensate so we never leave an order with no line items. The delete can itself fail
    // (e.g. a DB blip mid-checkout) — don't swallow it: retry once, and if it still fails,
    // cancel the order so it's not an orphaned "pending" order with items_total but no items.
    console.error("[placeOrder] order items failed to persist:", err);
    let cleaned = false;
    for (let attempt = 0; attempt < 2 && !cleaned; attempt++) {
      try {
        await orderService.delete(order.id);
        cleaned = true;
      } catch (delErr) {
        console.error(`[placeOrder] compensating delete failed (attempt ${attempt + 1}):`, delErr);
      }
    }
    if (!cleaned) {
      try {
        await orderService.update(order.id, { status: "cancelled", paymentStatus: "failed" });
      } catch (cancelErr) {
        console.error("[placeOrder] cancel fallback also failed — order is orphaned:", cancelErr);
      }
    }
    return { error: err instanceof Error ? err.message : "We couldn't complete your order. Please try again." };
  }

  // Persist the delivery address as an order_shipping_addresses row. The checkout
  // form collects a single address; without this insert the backoffice order detail
  // (and the freight engine) see no shipping address for card/bank/net-terms orders —
  // only quote-converted and Zoey-synced orders were getting one. Runs before the
  // Stripe early-return so EVERY payment method records shipping. Best-effort: a
  // failure here must not strand a paid order, so we log and continue.
  try {
    await orderShippingAddressService.createForParent(order.id, {
      first_name: firstName,
      last_name: lastName,
      email,
      phone: (formData.get("phone") as string)?.trim() || null,
      company: (formData.get("company") as string)?.trim() || null,
      address1,
      address2: billingAddress.address2 || null,
      city,
      state_or_province: state || null,
      postal_code: postalCode,
      country,
      country_code: country,
      shipping_method: shippingIncTax > 0 ? "Storefront delivery" : "Free delivery",
      base_cost: String(shippingExTax),
      cost_ex_tax: String(shippingExTax),
      cost_inc_tax: String(shippingIncTax),
      cost_tax: String(shippingTax),
      items_total: totalItems,
    });
  } catch (e) {
    console.error("[placeOrder] shipping address insert failed (non-fatal):", e);
  }

  // Enforce + record coupon usage for any codes carried on the cart. couponService.redeem
  // checks max_uses / max_uses_per_customer atomically (row lock), records a
  // coupon_redemptions row, and increments current_uses — so a code past its cap is simply
  // not redeemed (logged) rather than silently over-used. Runs before the Stripe early-return
  // so every payment method records redemption.
  const couponCodes = (cartWithItems as { coupon_codes?: string[] | null }).coupon_codes ?? [];
  for (const code of couponCodes) {
    if (!code) continue;
    try {
      await couponService.redeem({
        code,
        orderId: order.id,
        customerId: session?.customerId ?? null,
        discountAmount: "0",
      });
    } catch (e) {
      console.error(`[placeOrder] coupon "${code}" not redeemed:`, e instanceof Error ? e.message : e);
    }
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
    // Resolve the site origin through the shared SEO helper so email links use the exact
    // same precedence as every canonical/OG link (was DB-first here vs env-first in seo.ts).
    const siteUrl = siteBaseUrl(site?.url);
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
  // Auth + ownership FIRST — order numbers are semi-guessable, and this call has
  // a side effect (finalising/clearing the cart). Verifying ownership before any
  // mutation means an unauthorized caller can't wipe a victim's cart.
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
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to confirm payment" };
  }

  // Ownership verified — finalise the cart now that the card has been confirmed
  // (placeOrder's Stripe branch deliberately left it intact — see the comment
  // there). Cookie-based, so it works for guests too; best-effort.
  try {
    const uuid = await getCartUuid();
    if (uuid) {
      const cart = await cartService.getByUuid(uuid);
      if (cart) await cartService.markCompleted(cart.id);
      await clearCartUuid();
    }
  } catch {
    /* non-fatal: the webhook is the source of truth for payment status */
  }

  // NOTE: We intentionally do NOT optimistically flip the order to "paid" here.
  // The storefront cannot verify the Stripe PaymentIntent — @keenan/services
  // exposes no public PaymentService method to retrieve a PaymentIntent's status,
  // and this process holds no Stripe credentials. The portal Stripe webhook is
  // the source of truth and marks the order paid once Stripe reports `succeeded`.
  // Returning success here only advances the confirmation UI.
  return { success: true };
}
