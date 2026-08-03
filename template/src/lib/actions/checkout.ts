"use server";

import { redirect } from "next/navigation";
import { cartService, cartItemService, orderService, orderItemService, orderShippingAddressService, CHANNEL_ID, getEffectivePrice, productVariantService, channelSettingsService, getCheckoutSettings, paymentService, couponService } from "@/lib/store";
import { getFeatureFlag, getActiveSubscriptionForContact, shouldSuppressCatalogSalePrice, getSiteConfig } from "@/lib/store";
import { getCartUuid, clearCartUuid } from "@/lib/cart";
import { getSession } from "@/lib/auth";
import { sendOrderConfirmationEmail, sendOrderStaffNotificationEmail, resolveOrderNotificationRecipients, resolveEmailBranding, wantsStripeTestMode, productImageService } from "@keenan/services";
import { buildLineItems, withShipping, determinePaymentStatus, findBelowCostLines, type BelowCostLine } from "@/lib/checkout/order-draft";
import { getLineCosts } from "@/lib/store";
import { sendStaffNotification } from "@/lib/staff-email";
import { qualifiesForFreeDelivery } from "@/lib/checkout/shipping";
import { normaliseAuState, isValidAuPostcode } from "@/lib/checkout/au-address";
import { setLastOrder } from "@/lib/checkout/last-order";
import { siteBaseUrl } from "@/lib/seo";
import { resolveNetTermsEntitlement } from "@/lib/checkout/net-terms";
import {
  getContactPermissions,
  accountHasSavedAddress,
  sumContactOrderTotalSince,
  firstFailedOrderCondition,
  describeFailedCondition,
  resolveAccountEmailRecipients,
} from "@/lib/role-permissions";
import { applyAccountPricesToCart } from "@/lib/checkout/account-prices";
import { blockedProductIds } from "@/lib/catalog-scope";
import { resolveAccountOptions } from "@/lib/checkout/account-options";
import {
  effectiveMinimums,
  isPaymentMethodAllowed,
  minimumOrderError,
  disallowedPaymentMethodError,
} from "@/lib/checkout/account-options-policy";

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

  // ── L2 PRODUCT RESTRICTIONS: what we SHOW is what we ACCEPT. A line whose product this shopper
  // may no longer see (restricted since it was added, added under another account, or poked in by
  // hand) is REMOVED from the cart and the order is refused — a restricted product must never be
  // sellable through a stale cart. Unrestricted carts pay one cached set-lookup and nothing else.
  const blocked = await blockedProductIds(
    (fullCart.items as { product_id: number }[]).map((i) => i.product_id)
  );
  if (blocked.length > 0) {
    for (const item of fullCart.items as { id: number; product_id: number }[]) {
      if (blocked.includes(item.product_id)) {
        await cartItemService.deleteForParent(cartWithItems.id, item.id).catch(() => {});
      }
    }
    return {
      error:
        "Some items are no longer available on your account and have been removed from your cart. Please review your cart and try again.",
    };
  }

  // Validate billing info
  const email = (formData.get("email") as string)?.trim();
  const firstName = (formData.get("firstName") as string)?.trim();
  const lastName = (formData.get("lastName") as string)?.trim();
  const address1 = (formData.get("address1") as string)?.trim();
  const city = (formData.get("city") as string)?.trim();
  const rawState = (formData.get("state") as string)?.trim();
  const postalCode = (formData.get("postalCode") as string)?.trim();
  const country = (formData.get("country") as string)?.trim() || "AU";
  const phone = (formData.get("phone") as string)?.trim() || "";
  const paymentMethod = (formData.get("paymentMethod") as string)?.trim() || "";

  if (!email || !firstName || !lastName || !address1 || !city || !postalCode) {
    return { error: "Please fill in all required fields." };
  }

  // Australian address rules — the server half of the checkout form's dropdown +
  // 4-digit postcode. Never trust the client: a free-text state ("North Eastern
  // Australia") is unusable for freight, and a junk postcode matches no shipping
  // zone, which used to be billed as $0 delivery. An AU state MUST normalise to
  // one of the 8 codes — there is deliberately no fall back to the raw value,
  // because falling back is what let the reported junk through.
  const isAu = country === "AU";
  const auState = isAu ? normaliseAuState(rawState) : null;
  if (isAu) {
    if (!auState) {
      return {
        error: "Please select an Australian state or territory from the list.",
      };
    }
    if (!isValidAuPostcode(postalCode)) {
      return { error: "Please enter a valid 4-digit Australian postcode." };
    }
  }
  // AU: guaranteed non-null by the guard above. Non-AU: free text, as before.
  const state = auState ?? rawState ?? "";

  const billingAddress = {
    firstName,
    lastName,
    email,
    // Store phone under both keys: `telephone` (Zoey convention the backoffice reads) + `phone`.
    telephone: phone || null,
    phone: phone || null,
    address1,
    address2: (formData.get("address2") as string)?.trim() || "",
    city,
    state,
    postalCode,
    country,
  };

  // ── B2B account-role enforcement (docs/crm-parity/10-role-enforcement.md) ──
  // A contact on a B2B account may be restricted by their account role. Accountless
  // (B2C) shoppers and guests bypass entirely. The resolver FAILS OPEN on DB error
  // (logged) — a hiccup must never stop a customer paying us.
  const perms = await getContactPermissions(session?.contactId);

  if (perms.isB2B && !perms.can("submit_orders")) {
    return {
      error:
        "Your role on this account doesn't allow submitting orders. Ask your account administrator, or submit a quote request instead.",
    };
  }

  // "Can Add Billing/Shipping Address In Checkout": our checkout collects ONE
  // address used for both, so a NEW (not-yet-saved) address needs both codes.
  if (
    perms.isB2B &&
    perms.accountId !== null &&
    (!perms.can("add_billing_address_in_checkout") || !perms.can("add_shipping_address_in_checkout"))
  ) {
    const known = await accountHasSavedAddress(perms.accountId, address1, postalCode);
    if (!known) {
      return {
        error:
          "Your role on this account doesn't allow adding a new address during checkout. Please choose an address already saved on your account.",
      };
    }
  }
  // ── ACCOUNT CONTRACT PRICES: what the shopper is CHARGED must equal what they were shown. A line
  // may have been added before the account price was set (or before they logged in), so every line is
  // reconciled against the account's price here, at the moment of charging, and persisted to the cart.
  await applyAccountPricesToCart(cartWithItems.id, fullCart.items);

  // Re-validate subscription status — if member pricing is enabled but subscription
  // has expired since items were added, recalculate at non-member prices
  const memberPricingEnabled = await getFeatureFlag("member_pricing_enabled");
  if (memberPricingEnabled && session) {
    const activeSub = await getActiveSubscriptionForContact(session.contactId);
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

  // Below-cost sentry: an order is never blocked, but any line about to sell
  // under its current buy cost is stamped onto the order (metafields +
  // internal memo) and alerted to staff further down, so nothing ships at a
  // loss unseen. Check failure is non-fatal — checkout must not depend on it.
  let belowCostLines: BelowCostLine[] = [];
  try {
    const costs = await getLineCosts(
      lineItems.map((l) => ({ productId: l.productId, variantId: l.variantId }))
    );
    belowCostLines = findBelowCostLines(lineItems, costs);
  } catch (e) {
    console.error("[placeOrder] below-cost check failed (non-fatal):", e);
  }

  // Zoey Conditions on `submit_orders` ("If Cart Total / Month-to-date / Year-to-date
  // order total is less than X"). ANDed; evaluated against the GST-inc cart total and
  // the contact's channel order history. A failed MTD/YTD lookup skips that condition
  // (fail open, logged). Runs before ANY order row is written.
  if (perms.isB2B && session?.contactId) {
    const orderConditions = perms.conditions("submit_orders");
    if (orderConditions.length > 0) {
      const now = new Date();
      const needsMtd = orderConditions.some((c) => c.type === "mtd_total_lt");
      const needsYtd = orderConditions.some((c) => c.type === "ytd_total_lt");
      const [mtdTotal, ytdTotal] = await Promise.all([
        needsMtd
          ? sumContactOrderTotalSince(
              session.contactId,
              CHANNEL_ID,
              new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
            )
          : Promise.resolve(null),
        needsYtd
          ? sumContactOrderTotalSince(
              session.contactId,
              CHANNEL_ID,
              new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
            )
          : Promise.resolve(null),
      ]);
      const failed = firstFailedOrderCondition(orderConditions, {
        cartTotal: subtotalIncTax,
        mtdTotal,
        ytdTotal,
      });
      if (failed) {
        return {
          error: `This order can't be submitted — ${describeFailedCondition(failed)}. Ask your account administrator to approve it, or submit it as a quote request.`,
        };
      }
    }
  }

  // Shipping calculation
  let shippingIncTax = 0;
  const checkoutSettings = await getCheckoutSettings();
  const isMember = !!(session && await getActiveSubscriptionForContact(session.contactId));

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
      } else if (shippingResult.rate_card_name) {
        // A rate card IS configured for this channel but this address doesn't
        // price against it (unknown postcode, or somewhere we don't deliver).
        // REFUSE the order — silently writing it at $0 freight is a real money
        // leak, and the shopper saw an error in the summary either way.
        return {
          error: `We can't calculate delivery for postcode "${postalCode}". Please check it, or contact us for a freight quote.`,
        };
      }
      // No rate card configured for this channel at all → $0 shipping is intended.
    } catch (e) {
      // Rate lookup unavailable (DB blip) — don't strand a paying customer.
      console.error("[placeOrder] shipping rate lookup failed (non-fatal, $0 freight):", e);
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

  // Account Options (L3) — the authorization half of the checkout page's visibility filter.
  // Re-resolve the account's options with the SAME resolver the page used (never trust the client)
  // and reject anything the page would not have offered:
  //   (a) a payment method outside the account's allow-list;
  //   (b) a cart under the minimum order amount / quantity (per-account override, else the channel
  //       global — which also covers guests and account-less shoppers).
  // "What we show is exactly what we accept" — every filter added to the checkout page MUST be
  // duplicated here or the storefront leaks a bypass.
  const accountOptions = await resolveAccountOptions(session);
  if (paymentMethod && !isPaymentMethodAllowed(paymentMethod, accountOptions?.allowedPaymentMethods ?? null)) {
    return { error: disallowedPaymentMethodError() };
  }
  const minError = minimumOrderError(
    { subtotalIncTax, itemCount: totalItems },
    effectiveMinimums(accountOptions, checkoutSettings)
  );
  if (minError) {
    return { error: minError };
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
  if (belowCostLines.length > 0) {
    orderMetafields.below_cost_lines = belowCostLines.map((l) => ({
      product_id: l.productId,
      variant_id: l.variantId,
      sku: l.sku,
      quantity: l.quantity,
      unit_ex_tax: l.unitExTax.toFixed(2),
      cost: l.cost.toFixed(2),
    }));
  }

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
          ...(session?.contactId ? { contact_id: { type: "eq", value: session.contactId } } : {}),
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
        // Breadcrumb BEFORE handing off to the card form — see the fresh-order
        // branch below for why it can't wait for confirmStripePayment.
        await setLastOrder(existing.order_number, "stripe");
        return { stripe: { clientSecret, orderNumber: existing.order_number } };
      }
    } catch (e) {
      console.error("[placeOrder] idempotency reuse check failed (non-fatal):", e);
    }
  }

  // Create order — stamped with the CONTACT (identity unification). customer_id
  // is legacy and no longer written by the storefront.
  const order = await orderService.create({
    channelId: CHANNEL_ID,
    contactId: session?.contactId ?? null,
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
    ...(belowCostLines.length > 0
      ? {
          internalMemo:
            `BELOW-COST PRICING — review before fulfilment: ` +
            belowCostLines
              .map((l) => `${l.sku ?? `#${l.productId}`} sold $${l.unitExTax.toFixed(2)} ex GST vs cost $${l.cost.toFixed(2)}`)
              .join("; "),
        }
      : {}),
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

  // Below-cost alert to staff. Sent for EVERY payment method (runs before the
  // Stripe early-return) and best-effort — the order already exists, stamped
  // with the same detail in internal_memo / metafields, so a failed email never
  // blocks checkout.
  if (belowCostLines.length > 0) {
    try {
      await sendStaffNotification({
        subject: `Below-cost pricing on order ${order.order_number}`,
        heading: "Order contains below-cost lines — review before fulfilment",
        rows: belowCostLines.map((l) => [
          l.sku ?? `#${l.productId}`,
          `${l.name} — qty ${l.quantity}, sold $${l.unitExTax.toFixed(2)} ex GST, cost $${l.cost.toFixed(2)}`,
        ]),
        portalPath: `/dashboard/orders/${order.id}`,
        linkLabel: "Review order",
      });
    } catch (e) {
      console.error("[placeOrder] below-cost staff alert failed (non-fatal):", e);
    }
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
      phone: phone || null,
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
        contactId: session?.contactId ?? null,
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
      //
      // Set the "you just ordered" breadcrumb HERE, not in confirmStripePayment:
      // that action empties the cart, and returning from it re-renders /checkout
      // in the same response (exactly the refresh described above), so the empty
      // -cart guard must already be able to see the cookie. Writing it now makes
      // that ordering irrelevant. Harmless if the shopper abandons the card form
      // — the cart is still full, so the guard never fires.
      await setLastOrder(order.order_number, "stripe");
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
    // Central template: sites row + Email Templates overrides (channel_settings
    // `email_template`), resolved by @keenan/services so every sender matches.
    const branding = await resolveEmailBranding(CHANNEL_ID).catch(() => undefined);
    const storeName = branding?.storeName || site?.siteName || channel?.name || undefined;
    // Resolve the site origin through the shared SEO helper so email links use the exact
    // same precedence as every canonical/OG link (was DB-first here vs env-first in seo.ts).
    const siteUrl = siteBaseUrl(site?.url);
    // Decorate the email lines with a primary product thumbnail (best-effort).
    const imageMap = await productImageService
      .primaryImageUrlsForProducts(fullCart.items.map((i) => i.product_id))
      .catch(() => new Map<number, string>());

    const confirmationParams = {
      // Logs each send on the order's history panel in the portal (one entry per recipient copy).
      orderId: order.id,
      orderNumber: order.order_number,
      customerName: `${firstName} ${lastName}`.trim() || undefined,
      storeName,
      paymentMethod,
      total: String(totalIncTax),
      items: fullCart.items.map((i) => ({
        name: i.product_name,
        quantity: i.quantity,
        sku: i.product_sku ?? null,
        imageUrl: imageMap.get(i.product_id) ?? null,
        url: i.product_slug ? `${siteUrl}/products/${i.product_slug}` : null,
      })),
      bankDetails: method?.bankDetails ?? null,
      // Use the customer's actual account terms for a net-terms invoice email.
      netTermsDays: paymentMethod === "net_terms" && netTerms ? netTerms.netTermsDays : (method?.netTermsDays ?? null),
      siteUrl,
      logoUrl: branding?.logoUrl ?? site?.logoUrl ?? null,
      logoAlt: branding?.logoAlt ?? site?.logoAlt ?? null,
      fromEmail: branding?.fromEmail ?? site?.fromEmail ?? null,
      brandColor: branding?.brandColor ?? null,
      footerText: branding?.footerText ?? null,
      testMode: isTestMode,
    };

    await sendOrderConfirmationEmail({ to: email, ...confirmationParams });

    // B2B: also mail the account colleagues whose ROLE grants the order-email triple
    // (Account / Own Account / Account-as-CC — see docs/crm-parity/10-role-enforcement.md).
    // sendOrderConfirmationEmail takes a single `to`, so each extra recipient gets its
    // own copy (the recipient SET is exact; a true Cc: header needs a services change).
    // Best-effort and independent: one bad address must not stop the others.
    if (perms.isB2B && perms.accountId !== null) {
      const extra = await resolveAccountEmailRecipients(perms.accountId, {
        doc: "orders",
        ownerContactId: session?.contactId ?? null,
        primaryEmail: email,
      });
      for (const recipient of [...extra.to, ...extra.cc]) {
        try {
          await sendOrderConfirmationEmail({ to: recipient, ...confirmationParams });
        } catch (e) {
          console.error(`[placeOrder] account order email to ${recipient} failed (non-fatal):`, e);
        }
      }
    }
  } catch (e) {
    console.error("[placeOrder] confirmation email failed (non-fatal):", e);
  }

  // Staff "new order" notification — best-effort, never blocks the order.
  // Recipients come from channel_settings `order_notification_emails` (portal:
  // Settings → Notifications); an empty/absent list is an opt-out. Card orders
  // are notified by the portal Stripe webhook once paid (placeOrder returns early
  // on the stripe branch), so this path covers bank-transfer / net-terms orders.
  try {
    const recipients = await resolveOrderNotificationRecipients(CHANNEL_ID);
    if (recipients.length > 0) {
      const { site, channel } = await getSiteConfig();
      const storeName = site?.siteName || channel?.name || null;
      // Brand the staff alert to match the storefront the order came from (same
      // branding the customer confirmation email uses) — not the Keenan default.
      const branding = await resolveEmailBranding(CHANNEL_ID).catch(() => undefined);
      const portalBase = (process.env.PORTAL_BASE_URL || "https://keenan-group.com.au").replace(/\/$/, "");
      await sendOrderStaffNotificationEmail({
        to: recipients,
        orderId: order.id,
        orderNumber: order.order_number,
        orderUrl: `${portalBase}/dashboard/orders/${order.id}`,
        customerEmail: email,
        customerName: `${firstName} ${lastName}`.trim() || null,
        total: String(totalIncTax),
        paymentMethod,
        storeName,
        logoUrl: branding?.logoUrl ?? site?.logoUrl ?? null,
        logoAlt: branding?.logoAlt ?? site?.logoAlt ?? null,
        siteUrl: branding?.siteUrl ?? null,
        fromEmail: branding?.fromEmail ?? site?.fromEmail ?? null,
        brandColor: branding?.brandColor ?? null,
        bannerBgColor: branding?.bannerBgColor ?? null,
        footerText: branding?.footerText ?? null,
        items: fullCart.items.map((i) => ({ name: i.product_name, quantity: i.quantity })),
        testMode: isTestMode,
      });
    }
  } catch (e) {
    console.error("[placeOrder] staff order notification failed (non-fatal):", e);
  }

  // Breadcrumb so a shopper who comes BACK to /checkout after ordering lands on
  // their confirmation instead of the now-empty cart.
  await setLastOrder(order.order_number, paymentMethod);

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
    const order = orders.data[0] as { id: number; contact_id: number | null } | undefined;
    if (!order) return { success: false, error: "Order not found" };
    if (order.contact_id !== session.contactId) return { success: false, error: "Forbidden" };
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
    // Same breadcrumb the bank/net-terms path sets: the card flow navigates to
    // the confirmation client-side, so a Back button (or a lost push) must not
    // drop the shopper on an empty cart.
    await setLastOrder(orderNumber, "stripe");
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
