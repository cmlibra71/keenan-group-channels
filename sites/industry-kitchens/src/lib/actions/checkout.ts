"use server";

import { redirect } from "next/navigation";
import { cartService, cartItemService, orderService, orderItemService, orderShippingAddressService, CHANNEL_ID, getEffectivePrice, productVariantService, channelSettingsService, getCheckoutSettings, paymentService, couponService } from "@/lib/store";
import { getFeatureFlag, getActiveSubscriptionForContact, shouldSuppressCatalogSalePrice, getSiteConfig } from "@/lib/store";
import { getCartUuid, clearCartUuid } from "@/lib/cart";
import { getSession } from "@/lib/auth";
import { hasTestCheckoutSession } from "@/lib/checkout/test-session";
import { sendOrderConfirmationEmail, sendOrderStaffNotificationEmail, resolveOrderNotificationRecipients, excludePurchaser, resolveOrderBusinessName, resolveEmailBranding, wantsStripeTestMode, productImageService, summariseLinesFreight, syncOrderHandlingFlags, siteAccessProfileService, loadOrderContactForOrder, type EmailLineItem } from "@keenan/services";
import { buildLineItems, withShipping, determinePaymentStatus, findBelowCostLines, withLineCosts, withBackorderedQuantities, memberSavings, type BelowCostLine } from "@/lib/checkout/order-draft";
import { backorderFactsForProducts } from "@/lib/cart/backorder-facts";
import { canPurchaseQuantity } from "@keenan/services/backorder";
import { getLineCosts } from "@/lib/store";
import { sendStaffNotification } from "@/lib/staff-email";
import { qualifiesForFreeDelivery } from "@/lib/checkout/shipping";
import {
  holdsPayment,
  validateBulkyDelivery,
  SPECIALISED_HOLD_NOTICE,
  SPECIALISED_HOLD_PM,
  type SiteAccessAnswers,
} from "@/lib/checkout/bulky-delivery";
import {
  activeBrandFreeShippingSpecials,
  brandIdsForProducts,
} from "@/lib/checkout/free-shipping-brands";
import { matchBrandSpecial } from "@/lib/checkout/free-shipping-brands-policy";
import { normaliseAuState, isValidAuPostcode } from "@/lib/checkout/au-address";
import { normaliseCustomerReference } from "@/lib/checkout/customer-reference";
import { setLastOrder } from "@/lib/checkout/last-order";
import { canViewOrderConfirmation } from "@/lib/checkout/confirmation-access";
import { siteBaseUrl } from "@/lib/seo";
import type { ConfirmBillingDetails } from "@/lib/payments/stripe-gateways";
import { resolveNetTermsEntitlement } from "@/lib/checkout/net-terms";
import {
  ACCOUNT_REQUIRED_SETTING,
  SIGN_IN_REQUIRED_MESSAGE,
  checkoutNeedsSignIn,
} from "@/lib/checkout/account-required";
import {
  getContactPermissions,
  accountHasSavedAddress,
  sumContactOrderTotalSince,
  firstFailedOrderCondition,
  describeFailedCondition,
  resolveAccountEmailRecipients,
} from "@/lib/role-permissions";
import { mayFileAddressInBook } from "@/lib/account/address-authority";
import { applyAccountPricesToCart } from "@/lib/checkout/account-prices";
import { saveCheckoutAddressForContact } from "@/lib/contact-addresses";
import { blockedProductIds } from "@/lib/catalog-scope";
import { resolveAccountOptions } from "@/lib/checkout/account-options";
import {
  effectiveMinimums,
  isPaymentMethodAllowed,
  filterPaymentMethodsForAccount,
  isPaymentMethodOnChannel,
  unavailablePaymentMethodError,
  minimumOrderError,
  disallowedPaymentMethodError,
} from "@/lib/checkout/account-options-policy";
import { enforceLimit } from "@/lib/security/rate-limits";
import {
  resolvePaymentAvailability,
  PAY_UNAVAILABLE_ACCOUNT_ORDER,
} from "@/lib/checkout/payment-availability";
import {
  financeApplicationValues,
  financeFloorError,
  financeLinesFromCart,
  financeOfferForCart,
  filterFinanceMethods,
  fundingTypeError,
  isFinancePaymentMethod,
  weeklyAmountForMethod,
} from "@/lib/checkout/finance";
import { fileFinanceApplication } from "@/lib/checkout/finance-application";
import { financeApplicationForm } from "@/lib/checkout/finance-form";
import {
  financeApplicationFields,
  parseFieldDefs,
  validateSubmissionPayload,
} from "@keenan/services/services";

// Pricing/tax/payment-status computation lives in the pure order-draft module
// (lib/checkout/order-draft.ts), which delegates GST math to @keenan/services
// `gstSplit`. placeOrder is the imperative shell: it fetches, runs the impure
// shipping-rate lookup, then persists and fires side-effects.

type PlaceOrderResult = {
  error?: string;
  stripe?: {
    clientSecret: string;
    orderNumber: string;
    /**
     * The buyer, for the browser to attach to the card it confirms
     * (`billing_details`) — card b88eIfaS. Stripe Radar reads the customer's
     * name, email and billing address there and we sent none, so every payment
     * arrived anonymous ("Name: Not provided", "Customer email: Not provided",
     * every billing/shipping/IP distance "Not available"). Derived server-side
     * from the ORDER by @keenan/services, in the same call that stamped the
     * intent's `shipping`, so the two halves cannot describe different people.
     * It is NOT `receipt_email`: Stripe still sends the shopper nothing, which
     * card EInDib45 exists to keep true.
     */
    billingDetails?: ConfirmBillingDetails | null;
  };
};

export async function placeOrder(
  _prev: PlaceOrderResult | null,
  formData: FormData
): Promise<PlaceOrderResult> {
  const session = await getSession();

  // Rate limit before any work: this is the endpoint card-testing hits, running
  // a stolen card list through checkout one number at a time. Budgets are
  // deliberately generous (lib/security/rate-limit-core.ts) — a false positive
  // here costs a sale — and are keyed per caller AND per shopper.
  const checkoutLimit = await enforceLimit("checkout", {
    identifier: session ? String(session.contactId) : null,
    identifierIsEmail: false,
    surface: "checkout",
  });
  if (!checkoutLimit.allowed) return { error: checkoutLimit.message };

  // ── NO GUEST CHECKOUT (per channel). Industry Kitchens sells the way it does on
  // Zoey: sign in or create an account first (card LQM9FQYe). The checkout PAGE
  // draws the sign-in step instead of this form for the same shopper — show equals
  // accept, so the rule is enforced here too and a posted form cannot walk past it.
  // Unset setting = guest checkout, which is what Chefs Depot keeps (yUNl5TPq).
  if (checkoutNeedsSignIn(await getFeatureFlag(ACCOUNT_REQUIRED_SETTING), !!session)) {
    return { error: SIGN_IN_REQUIRED_MESSAGE };
  }

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

  // Per-product buying controls (card 7vu2iEEZ), re-checked HERE because this is where the money
  // moves: a cart built before staff switched a product off, or before its out-of-stock rule was
  // set to "No", must not become an order. Stock alone never refuses — an empty shelf is a back
  // order, and the cart said so. Never throws: a lookup failure places the order as it does today.
  try {
    const stock = await backorderFactsForProducts(
      (fullCart.items as { product_id: number }[]).map((i) => i.product_id)
    );
    const refused = (fullCart.items as { product_id: number; quantity: number }[]).find((i) => {
      const facts = stock.get(i.product_id);
      return facts ? facts.restrictAddToCart || !canPurchaseQuantity(facts, i.quantity) : false;
    });
    if (refused) {
      return {
        error:
          "One of the items in your cart isn't available to order online at that quantity. Please review your cart, or ask us for a quote.",
      };
    }
  } catch (e) {
    console.error("[placeOrder] buying-control check failed (non-fatal):", e);
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
  // The customer's own PO / reference, typed at the delivery step. Optional —
  // never a reason to refuse an order — and normalised (one line, capped at the
  // varchar(100) column) so a pasted value can never make the insert fail.
  const customerReference = normaliseCustomerReference(formData.get("customerReference"));

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
  // Held so the order can record what being a MEMBER saved on it (card pgRmsaTX).
  let memberSubscription: { id: number; plan_id: number } | null = null;
  if (memberPricingEnabled && session) {
    const activeSub = await getActiveSubscriptionForContact(session.contactId);
    if (activeSub) memberSubscription = activeSub as unknown as { id: number; plan_id: number };
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
  const { subtotal, itemsTotal: totalItems, lineItems: builtLineItems } = buildLineItems(
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
  // The same cost read also FREEZES the buy cost onto each line, so the order
  // records what it cost us at the time of sale (the portal's minimum-margin-floor
  // report reads it). Still inside the existing non-fatal try: if the cost lookup
  // fails the order places exactly as it does today, just without costs.
  let lineItems = builtLineItems;
  try {
    const costs = await getLineCosts(
      lineItems.map((l) => ({ productId: l.productId, variantId: l.variantId }))
    );
    belowCostLines = findBelowCostLines(lineItems, costs);
    lineItems = withLineCosts(lineItems, costs);
  } catch (e) {
    console.error("[placeOrder] below-cost check failed (non-fatal):", e);
  }

  // Freeze what was NOT on the shelf onto each line, so the order screen can say "Backordered"
  // per line for the rest of that line's life (card 7vu2iEEZ, Tim 2026-08-11). Read once, here:
  // stock moves nightly, so anything derived later would rewrite what the customer was told.
  // Non-fatal on the same terms as the cost read — an order must never fail to place over it.
  try {
    const stock = await backorderFactsForProducts(lineItems.map((l) => l.productId));
    lineItems = withBackorderedQuantities(lineItems, stock);
  } catch (e) {
    console.error("[placeOrder] back-order stamp failed (non-fatal):", e);
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

  // ── BULKY ITEMS (card Wxjp8wpg; 27-Jul group decision) ────────────────────────────────────
  // What is bulky is read from the PRODUCTS here, never from the submitted form: the choice the
  // shopper is forced to make must be the choice we enforce. The same read gives us the shipment
  // weight and unit count for weight-/item-rated shipping zones, and the dangerous-goods lines.
  const cartFreight = await summariseLinesFreight(
    (fullCart.items as Array<{ product_id: number; quantity: number }>).map((i) => ({
      product_id: i.product_id,
      quantity: Number(i.quantity) || 0,
    }))
  ).catch(() => null);
  const bulkyProducts = cartFreight?.bulky ?? [];
  const deliveryServiceRaw = (formData.get("deliveryService") as string)?.trim() || null;
  const siteAccess: SiteAccessAnswers = {
    deliveryType: (formData.get("siteDeliveryType") as string)?.trim() || null,
    truckAccessOk:
      formData.get("siteTruckAccess") === "yes"
        ? true
        : formData.get("siteTruckAccess") === "no"
          ? false
          : null,
    loadingDockAvailable: formData.get("siteLoadingDock") === "1",
    forkliftAtDelivery: formData.get("siteForklift") === "1",
    twoPersonDeliveryRequired: formData.get("siteTwoPerson") === "1",
    deliveryWindowStart: (formData.get("siteWindowStart") as string)?.trim() || null,
    deliveryWindowEnd: (formData.get("siteWindowEnd") as string)?.trim() || null,
    comments: (formData.get("siteAccessComments") as string)?.trim() || null,
  };
  const bulkyError = validateBulkyDelivery({
    hasBulkyItems: bulkyProducts.length > 0,
    deliveryService: deliveryServiceRaw,
    siteAccess,
  });
  if (bulkyError) return { error: bulkyError };
  const deliveryServiceType = bulkyProducts.length > 0 ? deliveryServiceRaw : null;
  // A specialised delivery cannot be priced from a rate table, so the order is HELD: no freight
  // is charged, no card is taken, and our team quotes it and collects payment afterwards.
  const heldForSpecialised = holdsPayment(deliveryServiceType);

  // Shipping calculation. The rate card states EX-GST figures and GST is added on top of
  // them — a $30 flat rate is $33 inc (Tim, card twwZMnMY). Never back GST out of the rate.
  let shippingRateExTax = 0;
  const checkoutSettings = await getCheckoutSettings();
  const isMember = !!(session && await getActiveSubscriptionForContact(session.contactId));

  // Brand free-shipping special (card 88Ay7UGA). Resolved here from the CART WE
  // ARE CHARGING, against the same rows and the same Melbourne date the checkout
  // page used to draw its summary — show equals accept, including on the last
  // minute of the last day of a special.
  const brandSpecials = await activeBrandFreeShippingSpecials();
  const cartBrandIds = brandSpecials.length
    ? [
        ...(
          await brandIdsForProducts(
            (fullCart.items as { product_id: number }[]).map((i) => i.product_id)
          )
        ).values(),
      ]
    : [];
  const brandFreeShipping = !!matchBrandSpecial(brandSpecials, cartBrandIds);

  // Shipping is quoted to the customer on the EX-tax subtotal (checkout page +
  // CheckoutForm pass cart.cartAmount), so the order must use the same basis or
  // the charged shipping diverges from the quote at tier/cap boundaries.
  if (heldForSpecialised) {
    // Held for a human quote — charging a table rate for a job we've just been told the table
    // can't price would be a made-up number on a real invoice.
    shippingRateExTax = 0;
  } else if (
    qualifiesForFreeDelivery({
      enabled: checkoutSettings.freeShippingEnabled,
      isMember,
      amount: subtotalExTax,
      threshold: checkoutSettings.freeShippingThreshold,
      brandFreeShipping,
    })
  ) {
    // Free delivery: a member over the threshold, or a brand special on this cart
    shippingRateExTax = 0;
  } else {
    // Calculate from shipping rate cards (zone-based table rates: by order value, weight or
    // item count depending on the matched zone — card Wxjp8wpg).
    try {
      const { calculateShipping } = await import("@/lib/store");
      const shippingResult = await calculateShipping(postalCode, subtotalExTax, {
        weightKg: cartFreight?.weight_kg ?? null,
        itemCount: cartFreight?.item_count ?? null,
        // A weight-rated zone must not price a cart where some lines have no catalogue
        // weight — the weighed lines alone would land it in a cheap tier.
        weightIncomplete: cartFreight ? cartFreight.has_unweighed_lines : true,
      });
      if (shippingResult.success) {
        shippingRateExTax = shippingResult.cost;
      } else if (shippingResult.rate_card_name) {
        // A rate card IS configured for this channel but this address doesn't
        // price against it (unknown postcode, or somewhere we don't deliver).
        // REFUSE the order — silently writing it at $0 freight is a real money
        // leak, and the shopper saw an error in the summary either way.
        //
        // Say WHICH thing failed. A zone that matched and then couldn't be measured
        // (it rates by weight, and the catalogue has no weight for these items) is not
        // a postcode problem, and blaming the postcode contradicts the reason the order
        // summary on the same page has been showing all along.
        return {
          error: shippingResult.zone_id
            ? `${shippingResult.error ?? "We can't calculate delivery for this order."} Please contact us for a freight quote.`
            : `We can't calculate delivery for postcode "${postalCode}". Please check it, or contact us for a freight quote.`,
        };
      }
      // No rate card configured for this channel at all → $0 shipping is intended.
    } catch (e) {
      // Rate lookup unavailable (DB blip) — don't strand a paying customer.
      console.error("[placeOrder] shipping rate lookup failed (non-fatal, $0 freight):", e);
      shippingRateExTax = 0;
    }
  }
  // The rate is ex-GST; withShipping adds GST on top and rolls it into the order total.
  const { shipping, total } = withShipping(subtotal, shippingRateExTax);
  const shippingExTax = shipping.exTax;
  const shippingIncTax = shipping.incTax;
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
  // (0) FIRST: is the method offered on this channel to a customer at all? The
  // account allow-list only NARROWS the channel list and is null for most
  // shoppers, so on its own it accepted any string a form posted — a
  // `paymentMethod=silverchef` POST would have written a real order on a channel
  // that never enabled SilverChef, and a channel staff-only method could be
  // forced through by a customer. Same list the page renders from.
  if (!isPaymentMethodOnChannel(paymentMethod, checkoutSettings.customerPaymentMethods)) {
    return { error: unavailablePaymentMethodError() };
  }
  // (1) THEN the account's own two controls, and BOTH of them: the allow-list
  // (which methods this account may use at all) and the per-account staff-only
  // list (methods staff may key on the account's behalf but the customer may
  // never pick). One without the other is a bypass.
  if (
    paymentMethod &&
    !isPaymentMethodAllowed(
      paymentMethod,
      accountOptions?.allowedPaymentMethods ?? null,
      accountOptions?.staffOnlyPaymentMethods ?? null
    )
  ) {
    return { error: disallowedPaymentMethodError() };
  }

  // …and (c) an account that may use NONE of the store's methods. The page shows
  // that shopper a contact-us line and blocks Place Order; this is the authorization
  // half, resolved from the same two counts, so a posted form can't slip an unpaid
  // order past it. The store-has-nothing case is deliberately untouched: that one
  // still books the order with payment status "pending" (card N8kE8arY, and the
  // payment-methods register rule that predates it).
  // Both counts are taken from the CUSTOMER list (enabled minus channel
  // staff-only, card NmAfwrdE): a store whose only enabled method is staff-only
  // offers this shopper nothing, and that is the store's configuration, not a
  // restriction on their account — telling them otherwise sends them to ring a
  // sales desk that can't help.
  // The finance floor is part of "what this cart is offered", so both counts are
  // taken after it — exactly as the page renders them. Resolving them off the
  // unfiltered list counted methods the shopper could not pick, so a cart under
  // the finance minimum whose only surviving methods were SilverChef/Finance
  // passed this gate
  // with nothing actually offerable.
  const cartFinanceOffer = financeOfferForCart({
    lines: financeLinesFromCart(fullCart.items as never[], pricesIncludeTax),
    goodsTotalIncGst: subtotalIncTax,
    // This storefront's own floor and rates (card 6GBlDtwf) — the SAME settings
    // object the checkout page drew the offer from, because it is the same
    // `getCheckoutSettings()` read. A floor resolved differently here would
    // refuse an order the page invited.
    settings: checkoutSettings.financeSettings,
  });
  const offerableMethods = filterFinanceMethods(
    filterPaymentMethodsForAccount(
      checkoutSettings.customerPaymentMethods,
      accountOptions?.allowedPaymentMethods ?? null,
      accountOptions?.staffOnlyPaymentMethods ?? null
    ).filter((m) => m.id !== "net_terms" || !!netTerms),
    cartFinanceOffer.eligible
  );
  if (
    resolvePaymentAvailability(
      filterFinanceMethods(checkoutSettings.customerPaymentMethods, cartFinanceOffer.eligible)
        .length,
      offerableMethods.length,
      // A guest has no account, so the account wording would name something they
      // have not got — they fall to the store state and the order is placed unpaid.
      !!session
    ) === "account-restricted"
  ) {
    return { error: PAY_UNAVAILABLE_ACCOUNT_ORDER };
  }
  const minError = minimumOrderError(
    { subtotalIncTax, itemCount: totalItems },
    effectiveMinimums(accountOptions, checkoutSettings)
  );
  if (minError) {
    return { error: minError };
  }

  // A held specialised-delivery order takes no payment method at all: the customer is
  // not paying today, so the order sits unpaid ("pending") until logistics quote the
  // delivery and take payment on the order screen. Everything payment-shaped below
  // (finance validation, payment status, metafields) reads the EFFECTIVE method.
  //
  // A ZERO-VALUE cart is the other no-payment shape: there is nothing to charge. Stripe
  // refuses a $0 PaymentIntent outright, and this action writes the order row BEFORE it
  // calls Stripe, so a $0 card checkout used to leave a real order behind and then fail in
  // front of the shopper. Zero-value orders are a live Zoey flow (316 of them, last used
  // 3 August, card NmAfwrdE), so the order is simply placed with no payment method, exactly
  // like a store with none configured, and staff close it off from the order screen.
  const nothingToPay = totalIncTax <= 0;
  const effectivePaymentMethod = heldForSpecialised || nothingToPay ? "" : paymentMethod;

  // ── SilverChef / Finance (card VAjaPj0t) ──────────────────────────────────
  // The authorization half of the checkout page's finance offer, resolved with
  // the SAME function off the SAME goods total AND the same per-storefront
  // floor: a cart that has dropped under the finance minimum since the page
  // rendered is refused, never quietly financed.
  // The application is validated HERE, before any order row is written — a
  // half-filled application must not leave a numbered order behind. It is
  // FILED after the order exists (it carries the order number).
  // Same offer the availability gate above resolved, off the same cart and the
  // same goods total — computed once so the gate and this check can never
  // disagree about whether this basket clears the finance floor.
  const financeOffer = isFinancePaymentMethod(effectivePaymentMethod) ? cartFinanceOffer : null;
  let financeApplication: Record<string, string> | null = null;
  if (financeOffer) {
    if (!financeOffer.eligible) return { error: financeFloorError(financeOffer.minOrderIncGst) };

    financeApplication = financeApplicationValues((name) => formData.get(name) as string | null);
    // The funding type has to belong to the button AND to this basket — the
    // same list the page drew, off the same offer, so "Skope Funding (Skope
    // Brands only)" cannot be posted against a basket that is not all SKOPE.
    const typeError = fundingTypeError(effectivePaymentMethod, financeApplication.funding_type, financeOffer);
    if (typeError) return { error: typeError };

    // The stored field contract is the authority on what a complete application
    // is — the same list the panel renders and the submission service validates,
    // so the three cannot drift. Read from the DB when it is already there
    // (staff may have edited it), else from the definition it is created with.
    const storedForm = await financeApplicationForm();
    const fields = parseFieldDefs(storedForm?.fields);
    const result = validateSubmissionPayload(
      (fields.length ? fields : financeApplicationFields()).filter((f) => f.name !== "order_number"),
      financeApplication
    );
    if (!result.ok) return { error: result.error };
  }

  // Determine payment status based on the effective payment method (held and zero-value
  // orders resolved to "" above).
  const paymentStatus = determinePaymentStatus(effectivePaymentMethod);

  // Is this order being raised inside an EPHEMERAL test checkout session? That is a
  // property of THIS browser session only (a short-lived signed cookie granted
  // behind a server-side secret) — never a stored mode the shop can be left in.
  // Outside such a session the environment default applies: production is live.
  //
  // Two separate consequences, deliberately kept apart below:
  //   - testCheckoutSession forces the Stripe TEST secret key for the intent, and
  //     is refused outright if no test gateway exists (never falls back to live).
  //   - isTestMode tags the order/emails so test data can be cleared later.
  const testCheckoutSession = await hasTestCheckoutSession();
  const isTestMode = testCheckoutSession || (await wantsStripeTestMode(CHANNEL_ID));

  // Stamp test-mode marker + (for net-terms orders) the actual term length used,
  // so the confirmation page / invoice email show the customer's real terms.
  const orderMetafields: Record<string, unknown> = {};
  if (isTestMode) orderMetafields.test_mode = true;
  if (effectivePaymentMethod === "net_terms" && netTerms) orderMetafields.net_terms_days = netTerms.netTermsDays;
  // Stamp the cart uuid on card orders so a retry/double-submit can find and reuse
  // the existing awaiting_payment order instead of creating a duplicate (see below).
  if (effectivePaymentMethod === "stripe") orderMetafields.cart_uuid = uuid;
  if (deliveryServiceType) {
    orderMetafields.delivery_service_type = deliveryServiceType;
    orderMetafields.bulky_products = bulkyProducts.map((p: { sku: string | null; name: string }) => p.sku ?? p.name);
  }
  if (paymentMethod === "stripe") orderMetafields.cart_uuid = uuid;
  // MEMBER SAVINGS, recorded at the moment of sale. Historically only the price paid
  // was stored, so "what has my membership saved me?" could only ever be estimated
  // against today's prices; from here on the comparison against the non-member price
  // is frozen onto the order (card pgRmsaTX). Non-fatal by design, exactly like the
  // below-cost sentry: a reporting figure must never cost a customer their order.
  if (memberSubscription) {
    try {
      const savings = memberSavings(fullCart.items, pricesIncludeTax);
      if (savings.savedExTax > 0) {
        orderMetafields.member_savings = {
          subscription_id: memberSubscription.id,
          plan_id: memberSubscription.plan_id,
          saved_ex_tax: savings.savedExTax.toFixed(2),
          saved_inc_tax: savings.savedIncTax.toFixed(2),
          compared_against: "non_member_list_price",
          lines: savings.lines.map((l) => ({
            product_id: l.productId,
            variant_id: l.variantId,
            sku: l.sku,
            quantity: l.quantity,
            non_member_unit: l.nonMemberUnit.toFixed(2),
            charged_unit: l.chargedUnit.toFixed(2),
          })),
        };
      }
    } catch (e) {
      console.error("[placeOrder] member savings stamp failed (non-fatal):", e);
    }
  }
  // Finance: what was offered and what was chosen, on the order itself, so the
  // back office can see the weekly figure the customer was shown even if the
  // application row is later archived.
  if (financeOffer && financeApplication) {
    orderMetafields.finance_method = effectivePaymentMethod;
    orderMetafields.finance_weekly_amount = (
      weeklyAmountForMethod(effectivePaymentMethod, financeOffer) ?? 0
    ).toFixed(2);
    orderMetafields.finance_funding_type = financeApplication.funding_type ?? null;
  }
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
  if (effectivePaymentMethod === "stripe") {
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
      const existing = (open.data as Array<{ id: number; order_number: string; customer_po?: string | null; metafields?: Record<string, unknown> | null }>).find(
        (o) => (o.metafields ?? {})?.cart_uuid === uuid
      );
      if (existing) {
        // The shopper may have added, corrected OR CLEARED their reference on the
        // retry — the box on the form is the truth, so an emptied box clears the
        // order too rather than leaving the first attempt's value on it. Safe to
        // write on its own: OrderService.beforeUpdate only moves status when
        // paymentStatus is part of the same update.
        if (customerReference !== (existing.customer_po ?? null)) {
          await orderService.update(existing.id, { customerPo: customerReference });
        }
        const { clientSecret, billingDetails } = await paymentService.createStripePaymentIntent(existing.id, {
          amount: String(totalIncTax),
          description: `Order ${existing.order_number}`,
          customer_email: email,
          // Per-call only; nothing persisted. Refused rather than charged live if
          // no test gateway is configured.
          test_mode: testCheckoutSession,
        });
        // Breadcrumb BEFORE handing off to the card form — see the fresh-order
        // branch below for why it can't wait for confirmStripePayment.
        await setLastOrder(existing.order_number, "stripe");
        return { stripe: { clientSecret, orderNumber: existing.order_number, billingDetails } };
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
    paymentMethod: effectivePaymentMethod || undefined,
    paymentStatus,
    // The bulky-item choice rides on the ORDER so the portal, the freight engine and the
    // packing floor all read the same answer (card Wxjp8wpg).
    ...(deliveryServiceType ? { deliveryServiceType } : {}),
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
    // Zoey's "Customer Reference". Same field the portal's Delivery card and the
    // amend form edit, and the first thing the invoice reads (card rmHBw8vA).
    ...(customerReference ? { customerPo: customerReference } : {}),
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

  // File the finance application and tell the rep (card VAjaPj0t). The order is
  // already placed and unpaid; this never throws, and a failure is stamped on
  // the order rather than shown to the shopper — the staff email carries every
  // answer, so an application is never silently lost.
  if (financeOffer && financeApplication) {
    const filed = await fileFinanceApplication({
      orderId: order.id,
      orderNumber: order.order_number,
      paymentMethod: effectivePaymentMethod,
      values: financeApplication,
      uploadToken: (formData.get("financeUploadToken") as string)?.trim() || null,
      accountId: perms.accountId ?? netTerms?.accountId ?? null,
      replyTo: email,
      weeklyAmount: weeklyAmountForMethod(effectivePaymentMethod, financeOffer) ?? 0,
      testMode: isTestMode,
    });
    try {
      await orderService.update(order.id, {
        metafields: {
          ...orderMetafields,
          finance_application_uuid: filed.submissionUuid,
          finance_application_notified: filed.notified,
          ...(filed.error ? { finance_application_error: filed.error } : {}),
        },
      });
    } catch (e) {
      console.error("[placeOrder] finance application not stamped on the order (non-fatal):", e);
    }
  }

  // Below-cost alert to staff. Sent for EVERY payment method (runs before the
  // Stripe early-return) and best-effort — the order already exists, stamped
  // with the same detail in internal_memo / metafields, so a failed email never
  // blocks checkout.
  //
  // This is an ORDER alert, so it goes to the portal's "Order notifications"
  // recipients — the people already told about every order — rather than the
  // quote/storefront staff list.
  if (belowCostLines.length > 0) {
    try {
      await sendStaffNotification({
        audience: "orders",
        // Same list as the "new order" alert below, so it needs the same rule:
        // don't send the buyer an internal warning about their own order.
        excludeEmail: email,
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
      shipping_method: heldForSpecialised
        ? "Specialised delivery — to be quoted"
        : deliveryServiceType === "curbside"
          ? "Curbside delivery"
          : shippingIncTax > 0
            ? "Storefront delivery"
            : "Free delivery",
      base_cost: String(shippingExTax),
      cost_ex_tax: String(shippingExTax),
      cost_inc_tax: String(shippingIncTax),
      cost_tax: String(shippingTax),
      items_total: totalItems,
    });
  } catch (e) {
    console.error("[placeOrder] shipping address insert failed (non-fatal):", e);
  }

  // ── Bulky / dangerous-goods handling (card Wxjp8wpg) ──────────────────────────────────────
  // Raise the freight flags from the order's LINES so logistics see "dangerous goods" or "held
  // for specialised delivery" on the order the moment it lands, without anyone having to run a
  // freight quote first. Non-fatal by contract — an alert must never fail a customer's order.
  await syncOrderHandlingFlags(order.id, deliveryServiceType);

  // A specialised delivery needs the site's access details before it can be quoted, so the
  // answers are stored as a real site_access_profile (the same record the freight planner and
  // the carrier request read) and linked to the order — not buried in a note.
  if (heldForSpecialised) {
    try {
      const profile = await siteAccessProfileService.upsert({
        account_id: netTerms?.accountId ?? null,
        address1,
        address2: billingAddress.address2 || null,
        city,
        state: state || null,
        postal_code: postalCode,
        country_code: country,
        delivery_type: siteAccess.deliveryType,
        truck_access_ok: siteAccess.truckAccessOk,
        loading_dock_available: siteAccess.loadingDockAvailable,
        forklift_at_delivery: siteAccess.forkliftAtDelivery,
        two_person_delivery_required: siteAccess.twoPersonDeliveryRequired,
        delivery_window_start: siteAccess.deliveryWindowStart,
        delivery_window_end: siteAccess.deliveryWindowEnd,
        comments: siteAccess.comments,
        source: "checkout",
      });
      await orderService.update(order.id, {
        siteAccessProfileId: profile.id as number,
        internalMemo:
          "SPECIALISED DELIVERY REQUESTED — order held unpaid. Quote the delivery from the site " +
          "access profile, then take payment. Bulky lines: " +
          (bulkyProducts.map((p: { sku: string | null; name: string }) => p.sku ?? p.name).join(", ") || "n/a"),
      });
    } catch (e) {
      // The order and its flags already exist and the answers are on the form submission we
      // logged — losing the profile row must not cost the customer their order.
      console.error("[placeOrder] site access profile for specialised delivery failed:", e);
    }
  }

  // "Save this address for next time" — keep a NEWLY typed address on the
  // shopper's account. Runs here (after the order is written, before the Stripe
  // early-return) so every payment method saves exactly once; the idempotency
  // reuse branch returns earlier, so a double-submit can't double-save.
  //
  // AUSTRALIAN ADDRESSES ONLY — `isAu` is part of the gate. The address book is
  // AU-only by contract: the account pages hard-code Australia/AU on write and
  // refuse an edit without a canonical state code and a 4-digit postcode. A
  // channel whose supported countries include New Zealand (Industry Kitchens
  // does) would otherwise file an "NZ" row the shopper can see but can never
  // edit. CheckoutForm hides the tick box once a non-AU country is picked; this
  // is the server half of that gate. `isAu` also guarantees `state` already
  // normalised to one of the 8 codes and the postcode passed isValidAuPostcode,
  // so the saved row satisfies exactly the rules the address book enforces.
  //
  // The role gate is re-checked server-side against the SAME `perms` the new-
  // address check above used — the checkbox is simply not rendered for a
  // restricted contact, and a hand-posted `saveAddress` must not bypass that.
  // FILING is a change to what the account has saved, so since card H5JdsMrC it
  // also takes the address book's own add codes (bill-to AND ship-to, which are
  // main-contact-only): a colleague who is not the manager still gets their order,
  // delivered to the address they typed — it is simply not added to the book.
  //
  // Wrapped whole in try/catch: the order already exists and is paid-for-real in
  // a moment. Failing to file an address in a book must never fail an order.
  if (session?.contactId && isAu && formData.get("saveAddress") === "on") {
    try {
      if (mayFileAddressInBook(perms)) {
        await saveCheckoutAddressForContact(session.contactId, {
          firstName,
          lastName,
          // Same read as the order_shipping_addresses insert above, so the two
          // records of one address never disagree.
          company: (formData.get("company") as string)?.trim() || "",
          phone: phone || "",
          address1,
          address2: billingAddress.address2 || "",
          city,
          stateOrProvince: state,
          postalCode,
          // The canonical pair the address book itself writes (actions/account.ts).
          country: "Australia",
          countryCode: "AU",
        });
      }
    } catch (e) {
      console.error("[placeOrder] address book save failed (non-fatal):", e);
    }
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
  if (effectivePaymentMethod === "stripe") {
    try {
      const { clientSecret, billingDetails } = await paymentService.createStripePaymentIntent(order.id, {
        amount: String(totalIncTax),
        description: `Order ${order.order_number}`,
        customer_email: email,
        // Per-call only; nothing persisted. Refused rather than charged live if
        // no test gateway is configured.
        test_mode: testCheckoutSession,
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
      return { stripe: { clientSecret, orderNumber: order.order_number, billingDetails } };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Failed to create payment." };
    }
  }

  // Mark cart as completed
  await cartService.markCompleted(cartWithItems.id);
  await clearCartUuid();

  // Product rows for BOTH emails below. The customer confirmation and the staff
  // alert list the same products, so the rows are decorated once here: the staff
  // alert used to pass bare name + quantity, which rendered the empty grey
  // placeholder box where every product thumbnail should be (and dropped the SKU
  // and the product link with it). Best-effort — if the image/site lookup fails
  // the rows degrade to name + quantity rather than blocking the order.
  let emailItems: EmailLineItem[] = fullCart.items.map((i) => ({
    name: i.product_name,
    quantity: i.quantity,
    sku: i.product_sku ?? null,
  }));
  try {
    // Resolve the site origin through the shared SEO helper so email links use the exact
    // same precedence as every canonical/OG link (was DB-first here vs env-first in seo.ts).
    const linkBase = siteBaseUrl((await getSiteConfig()).site?.url);
    const imageMap = await productImageService
      .primaryImageUrlsForProducts(fullCart.items.map((i) => i.product_id))
      .catch(() => new Map<number, string>());
    emailItems = fullCart.items.map((i) => ({
      name: i.product_name,
      quantity: i.quantity,
      sku: i.product_sku ?? null,
      imageUrl: imageMap.get(i.product_id) ?? null,
      url: i.product_slug ? `${linkBase}/products/${i.product_slug}` : null,
    }));
  } catch (e) {
    console.error("[placeOrder] email product rows degraded (non-fatal):", e);
  }

  // Order confirmation email — best-effort, never blocks the order. The email
  // helper redirects any @e2e.test (test) recipient to the test inbox, so test
  // orders never email a real person. Branded with THIS channel's name/logo/from
  // address (not Keenan Group) from the site config.
  try {
    const method = checkoutSettings.paymentMethods.find((m) => m.id === effectivePaymentMethod);
    const { site, channel } = await getSiteConfig();
    // Central template: sites row + Email Templates overrides (channel_settings
    // `email_template`), resolved by @keenan/services so every sender matches.
    const branding = await resolveEmailBranding(CHANNEL_ID).catch(() => undefined);
    const storeName = branding?.storeName || site?.siteName || channel?.name || undefined;
    const siteUrl = siteBaseUrl(site?.url);

    const confirmationParams = {
      // Logs each send on the order's history panel in the portal (one entry per recipient copy).
      orderId: order.id,
      orderNumber: order.order_number,
      customerName: `${firstName} ${lastName}`.trim() || undefined,
      storeName,
      paymentMethod: effectivePaymentMethod,
      total: String(totalIncTax),
      items: emailItems,
      // A held specialised-delivery order has no payment block at all, so without this the
      // customer's only email would read "Order Confirmed" over a total that excludes the
      // delivery we haven't quoted, and say nothing about the card not being charged.
      notice: heldForSpecialised ? SPECIALISED_HOLD_NOTICE : null,
      bankDetails: method?.bankDetails ?? null,
      // Use the customer's actual account terms for a net-terms invoice email.
      netTermsDays:
        effectivePaymentMethod === "net_terms" && netTerms
          ? netTerms.netTermsDays
          : (method?.netTermsDays ?? null),
      siteUrl,
      logoUrl: branding?.logoUrl ?? site?.logoUrl ?? null,
      logoAlt: branding?.logoAlt ?? site?.logoAlt ?? null,
      fromEmail: branding?.fromEmail ?? site?.fromEmail ?? null,
      brandColor: branding?.brandColor ?? null,
      // The banner colour reached the staff alert and the admin preview but not
      // the customer's own confirmation — carried now like every other field the
      // Email Templates page sets.
      bannerBgColor: branding?.bannerBgColor ?? null,
      footerText: branding?.footerText ?? null,
      // This channel's per-email wording (Storefront → Email Templates → Order
      // confirmation, card AnQgJh32). Branding is flattened here, so the wording
      // has to travel explicitly or the customer's confirmation ignores the
      // words staff wrote while the admin preview shows them.
      wording: branding?.wording ?? null,
      testMode: isTestMode,
      // Who to talk to about this order (card 6mAn2B9O). `sendOrderConfirmationEmail`
      // would resolve this itself from `orderId`, but the B2B loop below sends one
      // copy per account recipient off this same object — resolving it once here
      // means one query for the whole send instead of one per copy, and every copy
      // is guaranteed to name the same person.
      contact: await loadOrderContactForOrder(order.id).catch(() => null),
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
    // A staff member who orders as a customer already has the confirmation email;
    // sending them the internal alert as well means two emails for one order.
    const recipients = excludePurchaser(
      await resolveOrderNotificationRecipients(CHANNEL_ID),
      email
    );
    if (recipients.length > 0) {
      const { site, channel } = await getSiteConfig();
      const storeName = site?.siteName || channel?.name || null;
      // Brand the staff alert to match the storefront the order came from (same
      // branding the customer confirmation email uses) — not the Keenan default.
      const branding = await resolveEmailBranding(CHANNEL_ID).catch(() => undefined);
      const portalBase = (process.env.PORTAL_BASE_URL || "https://keenan-group.com.au").replace(/\/$/, "");
      // The customer's BUSINESS, where we already hold one (card yK25KBID). This
      // checkout asks for no company and none is being added (Chris, 2026-08-11),
      // so on a storefront order it comes from the shopper's own ACCOUNT — the
      // same resolver the portal's card-order alert uses, so the two senders can
      // never name different businesses for the same buyer.
      const company = await resolveOrderBusinessName({
        billingAddress: billingAddress as unknown as Record<string, unknown>,
        accountId: perms.accountId ?? netTerms?.accountId ?? null,
        // So an account merely named after this shopper — 7,330 of 20,356 live
        // memberships are, because a sole trader opens theirs under their own
        // name — is not printed straight back at staff as their "business".
        customerName: `${firstName} ${lastName}`.trim() || null,
      });
      await sendOrderStaffNotificationEmail({
        // Records the send on the order's history panel, exactly like the
        // customer confirmation above — without it a storefront order's staff
        // alert leaves no trace in the portal, so nobody can confirm from the
        // order who was (or was not) emailed about it.
        orderId: order.id,
        to: recipients,
        orderNumber: order.order_number,
        orderUrl: `${portalBase}/dashboard/orders/${order.id}`,
        customerEmail: email,
        customerName: `${firstName} ${lastName}`.trim() || null,
        company,
        total: String(totalIncTax),
        paymentMethod: effectivePaymentMethod,
        storeName,
        logoUrl: branding?.logoUrl ?? site?.logoUrl ?? null,
        logoAlt: branding?.logoAlt ?? site?.logoAlt ?? null,
        siteUrl: branding?.siteUrl ?? null,
        fromEmail: branding?.fromEmail ?? site?.fromEmail ?? null,
        brandColor: branding?.brandColor ?? null,
        bannerBgColor: branding?.bannerBgColor ?? null,
        footerText: branding?.footerText ?? null,
        items: emailItems,
        testMode: isTestMode,
      });
    }
  } catch (e) {
    console.error("[placeOrder] staff order notification failed (non-fatal):", e);
  }

  // Breadcrumb so a shopper who comes BACK to /checkout after ordering lands on
  // their confirmation instead of the now-empty cart.
  // A held order has no payment method, so it needs its own marker: with an empty `pm` the
  // confirmation page rendered nothing but "Order Confirmed" — no mention that nothing was
  // charged and that delivery is still to be quoted.
  const confirmationPm = heldForSpecialised ? SPECIALISED_HOLD_PM : effectivePaymentMethod;
  await setLastOrder(order.order_number, confirmationPm);

  const pmParam = confirmationPm ? `&pm=${encodeURIComponent(confirmationPm)}` : "";
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
  // Order numbers are semi-guessable, so cap how fast one caller can probe them
  // BEFORE doing any lookup work. Guests are legitimate callers here (see below),
  // so the per-caller identifier is the signed-in contact when there is one and
  // the probed order number otherwise; the IP envelope applies to both.
  const limitSession = await getSession();
  const limit = await enforceLimit("payment_confirm", {
    identifier: limitSession ? String(limitSession.contactId) : `order:${orderNumber}`,
    identifierIsEmail: false,
    surface: "stripe confirm",
  });
  if (!limit.allowed) return { success: false, error: limit.message };

  // Ownership NEXT, and side effects only after it: this call finalises/clears the
  // cart, so an unauthorized caller must not be able to wipe a victim's cart.
  // Exactly the two viewers the confirmation page itself accepts, resolved by the
  // same helper: the signed-in contact who owns the order, or the GUEST who just
  // placed it, proven by the short-lived httpOnly `last_order` cookie placeOrder
  // writes for this purpose.
  //
  // It used to demand a SESSION, so a guest paying by card was refused here: their
  // cart was never marked completed and the cart cookie never cleared, leaving the
  // items sitting in the basket after they had paid, and a second checkout would
  // have charged them again. Latent while no storefront took card payments; live
  // the moment Industry Kitchens switched card on. Card NmAfwrdE.
  const ownsOrder = await canViewOrderConfirmation(orderNumber).catch(() => false);
  if (!ownsOrder) return { success: false, error: "Forbidden" };

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
