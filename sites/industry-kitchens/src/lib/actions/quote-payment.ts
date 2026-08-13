"use server";

import { revalidatePath } from "next/cache";
import {
  quoteService,
  orderService,
  orderItemService,
  orderShippingAddressService,
  customerAddressService,
  paymentService,
  channelSettingsService,
  getCheckoutSettings,
  getSiteConfig,
  CHANNEL_ID,
} from "@/lib/store";
import {
  quoteAttributeService,
  withTransaction,
  runWithOrderOrigin,
  wantsStripeTestMode,
  resolveEmailBranding,
  resolveOrderNotificationRecipients,
  sendOrderConfirmationEmail,
  sendOrderStaffNotificationEmail,
  productImageService,
} from "@keenan/services";
import { getSession } from "@/lib/auth";
import { getContactPermissions, getAccountContactIds } from "@/lib/role-permissions";
import { resolveAccountOptions } from "@/lib/checkout/account-options";
import { filterPaymentMethodsForAccount } from "@/lib/checkout/account-options-policy";
import { isFinancePaymentMethod } from "@/lib/checkout/finance";
import { resolveNetTermsEntitlement } from "@/lib/checkout/net-terms";
import { determinePaymentStatus } from "@/lib/checkout/order-draft";
import { sendStaffNotification } from "@/lib/staff-email";
import { siteBaseUrl } from "@/lib/seo";
import { quoteHidesPrices, resolveQuoteTotal } from "@/lib/quotes/price-visibility";
import { getHidePriceStatuses } from "@/lib/quotes/hide-price-statuses";
import { quoteGstTotals } from "@/lib/quotes/quote-gst";
import { resolveQuoteGstRate } from "@/lib/quotes/quote-gst-rate";
import {
  readQuoteDeposit,
  resolveQuoteDeposit,
  depositLabel,
  type ResolvedDeposit,
} from "@/lib/quotes/quote-deposit";
import { resolveQuotePayState, PLUS_FREIGHT_NOTICE } from "@/lib/quotes/quote-payable";
import {
  planOrderFromPaidQuote,
  type PlannedShipTo,
  type PlannableQuote,
} from "@/lib/quotes/quote-order-plan";

/**
 * Paying a quote from the customer's own account area — card 0Wy0xHuq.
 *
 * Steve, 2026-08-07: "Customers must make the payment inside their quote in
 * their logged in area of the site." So this lives here rather than on the
 * emailed /q link, and every call is authenticated and ownership-checked.
 *
 * It is deliberately the SAME shape as checkout: payment methods are read
 * through `getCheckoutSettings` + the account allow-list filter that
 * `placeOrder` authorises against, the order is created through
 * `orderService`/`orderItemService` exactly as a web order is, and the same
 * confirmation + staff-notification emails go out. Nothing about this order
 * should look different downstream from an order somebody placed through the
 * cart — "the resulting order behaves like any other website order and still
 * reaches the sales team."
 *
 * Money is GST-INCLUSIVE throughout: what is charged is the figure the customer
 * read on their quote (or the deposit the rep set), never the ex-GST number the
 * quote row happens to store.
 */

export type PayQuoteResult = {
  error?: string;
  /** Card payments: hand off to Stripe Elements in the browser. */
  stripe?: { clientSecret: string; orderNumber: string; amount: string };
  /** Everything else: the order is placed; send the customer to its confirmation. */
  placed?: { orderNumber: string; paymentMethod: string };
};

type QuoteRow = PlannableQuote & { id: number };

/** Load the quote and confirm this signed-in customer is allowed to see it. */
async function loadOwnedQuote(
  quoteId: number,
  contactId: number
): Promise<QuoteRow | null> {
  const quote = (await quoteService.getWithItems(quoteId)) as QuoteRow | null;
  if (!quote || quote.channel_id !== CHANNEL_ID) return null;
  if (quote.contact_id === contactId) return quote;
  // Same rule the quote page renders under: a B2B role carrying
  // `view_company_quotes` sees any quote belonging to their account's members.
  const perms = await getContactPermissions(contactId);
  const canSeeAccountQuotes =
    perms.isB2B && perms.accountId !== null && perms.can("view_company_quotes");
  if (!canSeeAccountQuotes) return null;
  const memberIds = await getAccountContactIds(perms.accountId!);
  if (!quote.contact_id || !memberIds.includes(quote.contact_id as number)) return null;
  return quote;
}

/** A saved customer address, shaped for `order_shipping_addresses`. */
function savedAddressToShipTo(
  a: Record<string, unknown>,
  email: string | null
): Omit<PlannedShipTo, "shippingMethod" | "baseCost" | "costExTax" | "costIncTax" | "costTax"> {
  const s = (k: string, alt: string) => (a[k] ?? a[alt] ?? null) as string | null;
  return {
    firstName: s("first_name", "firstName"),
    lastName: s("last_name", "lastName"),
    company: s("company", "company"),
    address1: (s("address1", "address1") ?? "") as string,
    address2: s("address2", "address2"),
    city: (s("city", "city") ?? "") as string,
    stateOrProvince: s("state_or_province", "stateOrProvince"),
    postalCode: s("postal_code", "postalCode"),
    country: (s("country_code", "countryCode") ?? "AU") as string,
    countryCode: s("country_code", "countryCode") ?? "AU",
    email,
    phone: s("phone", "phone"),
  };
}

/**
 * Pay a quote. `addressId` is only consulted when the quote itself carries no
 * delivery address — an agreed ship-to on a quote is not the customer's to
 * change (Steve: "Quote are locked, but Staff can change address, customers
 * can't").
 */
export async function payQuote(
  quoteId: number,
  paymentMethod: string,
  addressId?: number | null
): Promise<PayQuoteResult> {
  const session = await getSession();
  if (!session?.contactId) return { error: "Please sign in to pay this quote." };

  const quote = await loadOwnedQuote(quoteId, session.contactId);
  if (!quote) return { error: "Quote not found." };

  // ── What is owed ────────────────────────────────────────────────────────
  const gstRate = await resolveQuoteGstRate(quote.tax_class_id);
  const hidePrices = quoteHidesPrices(
    { status: quote.status as string, hide_prices: quote.hide_prices as boolean | null },
    await getHidePriceStatuses()
  );
  // The SAME split the quote page prints — the customer pays the figure they read.
  const view = quoteGstTotals(resolveQuoteTotal(quote) ?? 0, quote, gstRate);
  const deposit = resolveQuoteDeposit(readQuoteDeposit(quote.attributes), view.incTax);
  const amountDue = deposit ? deposit.due_now : Math.round(view.incTax * 100) / 100;

  // ── Which methods this store, and this account, actually allow ──────────
  // Read EXACTLY as checkout reads them, and authorise against the same
  // resolvers placeOrder uses — what we show is what we accept. Staff-only
  // methods are subtracted here as well as on the page, so the customer can
  // neither see one nor post one back at this quote.
  const [checkoutSettings, accountOptions, netTerms] = await Promise.all([
    getCheckoutSettings(),
    resolveAccountOptions(session),
    resolveNetTermsEntitlement(session),
  ]);
  // Customer surface: the channel's customer-facing list (enabled minus channel
  // staff-only, services `customerFacingPaymentMethods`), narrowed by the
  // account's allow-list — read exactly as the page reads it, so what we show is
  // what we accept.
  //
  // The equipment-finance methods are excluded HERE as well as on the page (card
  // VAjaPj0t): SilverChef/Finance place an order unpaid against an application
  // form behind a $1,000 floor, none of which this screen implements. Enabling
  // them for the storefront checkout must not turn a quote into an unpaid order
  // through a bare button here.
  const methods = filterPaymentMethodsForAccount(
    checkoutSettings.customerPaymentMethods.filter((m) => !isFinancePaymentMethod(m.id)),
    accountOptions?.allowedPaymentMethods ?? null,
    accountOptions?.staffOnlyPaymentMethods ?? null
  ).filter((m) => m.id !== "net_terms" || !!netTerms);

  // ── Where it ships ──────────────────────────────────────────────────────
  const quoteHasShipTo = Object.values(
    (quote.shipping_address as Record<string, unknown> | null) ?? {}
  ).some((v) => v !== null && v !== undefined && v !== "");
  let fallbackShipTo: ReturnType<typeof savedAddressToShipTo> | null = null;
  if (!quoteHasShipTo) {
    try {
      const rows = (await customerAddressService.listForContact(
        session.contactId
      )) as Record<string, unknown>[];
      const chosen =
        (addressId != null && rows.find((r) => Number(r.id) === Number(addressId))) ||
        rows.find((r) => r.is_default_shipping ?? r.isDefaultShipping) ||
        rows[0];
      if (chosen) fallbackShipTo = savedAddressToShipTo(chosen, session.email ?? null);
    } catch {
      /* no saved address — the pay-state gate below refuses, with a reason */
    }
  }

  // ── The gate (same resolver the page greys the button from) ─────────────
  const payState = resolveQuotePayState({
    status: quote.status as string,
    hidesPrices: hidePrices,
    expiresAt: quote.expires_at as string | null,
    items: (quote.items ?? []) as { list_price?: string | null; sale_price?: string | null }[],
    amountDue,
    paymentMethodCount: methods.length,
    // …and how many the STORE offers a CUSTOMER on this surface, so a shopper whose
    // ACCOUNT allows none of them is told that, not "this store doesn't take online
    // payments" (card N8kE8arY) — and, just as importantly, the other way round: a
    // channel whose only enabled method is staff-only (IK's Send Invoice, card
    // NmAfwrdE) or finance offers this surface nothing, and that is the STORE's
    // configuration, not a restriction on their account.
    channelPaymentMethodCount: checkoutSettings.customerPaymentMethods.filter(
      (m) => !isFinancePaymentMethod(m.id)
    ).length,
    hasDeliveryAddress: quoteHasShipTo || fallbackShipTo !== null,
  });
  if (payState.kind !== "enabled") {
    return {
      error:
        payState.kind === "disabled"
          ? payState.reason
          : "This quote can no longer be paid online. Please contact us.",
    };
  }
  if (!methods.some((m) => m.id === paymentMethod)) {
    return { error: "That payment method isn't available on this quote." };
  }

  // ── B2B role gates — identical to accepting, because paying IS accepting ─
  const perms = await getContactPermissions(session.contactId);
  if (perms.isB2B && !perms.can("approve_quotes")) {
    return {
      error:
        "Your role on this account doesn't allow approving quotes. Ask your account administrator to pay it.",
    };
  }
  if (perms.isB2B && !perms.can("convert_company_quotes_to_order")) {
    return {
      error:
        "Your role on this account doesn't allow turning quotes into orders. Ask your account administrator.",
    };
  }

  // ── Idempotency: never let a double-click raise a second order ──────────
  // A quote already converted to a LIVE order is re-offered that order's payment
  // rather than creating another. (The quote's status also blocks a second pass,
  // but a retry mid-Stripe must still return a usable client secret.)
  const priorOrderId = quote.converted_order_id ? Number(quote.converted_order_id) : null;
  if (priorOrderId) {
    const prior = (await orderService.getById(priorOrderId).catch(() => null)) as {
      id: number;
      order_number: string;
      status?: string;
      payment_status?: string;
    } | null;
    if (prior && prior.status !== "cancelled") {
      if (prior.payment_status === "paid") {
        return { error: "This quote has already been paid." };
      }
      if (paymentMethod === "stripe") {
        const { clientSecret } = await paymentService.createStripePaymentIntent(prior.id, {
          amount: amountDue.toFixed(2),
          description: `Quote ${(quote.quote_number as string) ?? quote.id}`,
          customer_email: session.email ?? undefined,
        });
        return {
          stripe: {
            clientSecret,
            orderNumber: prior.order_number,
            amount: amountDue.toFixed(2),
          },
        };
      }
      return { placed: { orderNumber: prior.order_number, paymentMethod } };
    }
  }

  // ── Plan the order (same derivation staff conversion uses) ──────────────
  let copyAttributeCodes = new Set<string>();
  try {
    const defs = (await quoteAttributeService.listForChannel(
      quote.channel_id as number
    )) as Array<Record<string, unknown>>;
    copyAttributeCodes = new Set(defs.filter((d) => d.copy_to_order).map((d) => String(d.code)));
  } catch {
    /* carry nothing rather than leaking every attribute */
  }

  const plan = planOrderFromPaidQuote(quote, {
    gstRate,
    copyAttributeCodes,
    fallbackShipTo,
    fallbackBilling: fallbackShipTo
      ? {
          first_name: fallbackShipTo.firstName,
          last_name: fallbackShipTo.lastName,
          email: session.email ?? null,
          telephone: fallbackShipTo.phone,
          phone: fallbackShipTo.phone,
          address1: fallbackShipTo.address1,
          address2: fallbackShipTo.address2 ?? "",
          city: fallbackShipTo.city,
          state: fallbackShipTo.stateOrProvince,
          postalCode: fallbackShipTo.postalCode,
          country: fallbackShipTo.country,
        }
      : null,
  });

  const isTestMode = await wantsStripeTestMode(CHANNEL_ID).catch(() => false);
  const metafields: Record<string, unknown> = { ...plan.order.metafields };
  if (isTestMode) metafields.test_mode = true;
  metafields.paid_from_quote = quote.quote_number ?? quote.id;
  if (deposit) {
    // The rep's deposit terms travel with the order so the balance is chaseable.
    metafields.deposit = {
      mode: deposit.mode,
      percent: deposit.percent,
      due_now: deposit.due_now.toFixed(2),
      balance: deposit.balance.toFixed(2),
    };
  }
  if (plan.freightPending) metafields.plus_freight = true;
  if (paymentMethod === "net_terms" && netTerms) metafields.net_terms_days = netTerms.netTermsDays;

  const memoParts = [plan.order.internal_memo];
  if (plan.freightPending) {
    memoParts.push("NO FREIGHT ALLOCATED — quote paid online with no delivery charge. Plus Freight.");
  }
  if (deposit) {
    memoParts.push(
      `DEPOSIT: $${deposit.due_now.toFixed(2)} inc GST paid of $${deposit.total_inc.toFixed(
        2
      )} — balance $${deposit.balance.toFixed(2)} owing.`
    );
  }

  let created: { id: number; order_number: string };
  try {
    created = await runWithOrderOrigin(
      {
        source: "converted from quote",
        details: {
          quote_id: quote.id,
          quote_number: (quote.quote_number as string) ?? null,
          line_count: plan.items.length,
          paid_by_customer: true,
        },
      },
      async () =>
        await withTransaction(async () => {
          const order = (await orderService.create({
            ...plan.order,
            contact_id: quote.contact_id ?? session.contactId,
            ...(netTerms ? { account_id: plan.order.account_id ?? netTerms.accountId } : {}),
            payment_method: paymentMethod,
            payment_status: determinePaymentStatus(paymentMethod),
            internal_memo: memoParts.filter(Boolean).join("\n") || null,
            metafields,
          } as unknown as Record<string, unknown>)) as { id: number; order_number: string };

          for (const it of plan.items) {
            await orderItemService.createForParent(order.id, it.payload);
          }
          if (plan.shipTo) {
            await orderShippingAddressService.createForParent(order.id, {
              first_name: plan.shipTo.firstName,
              last_name: plan.shipTo.lastName,
              company: plan.shipTo.company,
              address1: plan.shipTo.address1,
              address2: plan.shipTo.address2,
              city: plan.shipTo.city,
              state_or_province: plan.shipTo.stateOrProvince,
              postal_code: plan.shipTo.postalCode,
              country: plan.shipTo.country,
              country_code: plan.shipTo.countryCode,
              email: plan.shipTo.email,
              phone: plan.shipTo.phone,
              shipping_method: plan.shipTo.shippingMethod,
              base_cost: plan.shipTo.baseCost,
              cost_ex_tax: plan.shipTo.costExTax,
              cost_inc_tax: plan.shipTo.costIncTax,
              cost_tax: plan.shipTo.costTax,
              items_total: plan.items.length,
            });
          }
          // The quote is settled the moment the order exists. markAccepted first so
          // the acceptance is audited and staff alerted exactly as any other
          // acceptance, then markConverted stamps the linkage.
          if (quote.status !== "quote_accepted") {
            await quoteService.markAccepted(quote.id);
          }
          await quoteService.markConverted(quote.id, order.id);
          return order;
        })
    );
  } catch (e) {
    console.error("[payQuote] order creation failed:", e);
    return {
      error:
        e instanceof Error && /already been converted/i.test(e.message)
          ? "This quote has already been turned into an order."
          : "We couldn't place this order. Please try again, or contact us.",
    };
  }

  // ── Side effects: none of these may fail the payment ────────────────────
  if (plan.freightPending) {
    await alertOrdersTeamNoFreight(created, quote, view.incTax).catch((e) =>
      console.error("[payQuote] no-freight alert failed (non-fatal):", e)
    );
  }

  if (paymentMethod === "stripe") {
    try {
      const { clientSecret } = await paymentService.createStripePaymentIntent(created.id, {
        amount: amountDue.toFixed(2),
        description: `Order ${created.order_number}`,
        customer_email: session.email ?? undefined,
      });
      revalidatePath(`/account/quotes/${quote.id}`);
      return {
        stripe: { clientSecret, orderNumber: created.order_number, amount: amountDue.toFixed(2) },
      };
    } catch (err) {
      // The order exists and is awaiting payment; the customer can retry.
      return { error: err instanceof Error ? err.message : "Failed to start the card payment." };
    }
  }

  await sendQuoteOrderEmails({
    order: created,
    quote,
    paymentMethod,
    totalInc: view.incTax,
    deposit,
    freightPending: plan.freightPending,
    netTermsDays: paymentMethod === "net_terms" && netTerms ? netTerms.netTermsDays : null,
    isTestMode,
    email: session.email ?? null,
  }).catch((e) => console.error("[payQuote] emails failed (non-fatal):", e));

  revalidatePath(`/account/quotes/${quote.id}`);
  revalidatePath("/account/quotes");
  return { placed: { orderNumber: created.order_number, paymentMethod } };
}

/**
 * "Create alert for order team that no Freight has been allocated" (Steve, card
 * 0Wy0xHuq). Goes to the ORDER notification list — the people already told about
 * every order — because it is an order that needs freight put on it.
 */
async function alertOrdersTeamNoFreight(
  order: { id: number; order_number: string },
  quote: QuoteRow,
  totalInc: number
): Promise<void> {
  await sendStaffNotification({
    audience: "orders",
    subject: `No freight allocated — order ${order.order_number}`,
    heading: "A customer paid a quote that carries no delivery charge",
    rows: [
      ["Order", order.order_number],
      ["From quote", String(quote.quote_number ?? quote.id)],
      ["Amount", `$${totalInc.toFixed(2)} inc GST — Plus Freight`],
      ["Action", "Allocate freight and invoice the delivery charge separately."],
    ],
    portalPath: `/dashboard/orders/${order.id}`,
    linkLabel: "Open order",
  });
}

/**
 * Customer confirmation + staff "new order" alert, the same pair a cart order
 * sends. Card orders skip this: the portal's Stripe webhook sends them once the
 * card is actually charged (exactly as checkout behaves).
 */
async function sendQuoteOrderEmails(args: {
  order: { id: number; order_number: string };
  quote: QuoteRow;
  paymentMethod: string;
  totalInc: number;
  /** Set when only the deposit is being taken now — the order is still booked at totalInc. */
  deposit: ResolvedDeposit | null;
  freightPending: boolean;
  netTermsDays: number | null;
  isTestMode: boolean;
  email: string | null;
}): Promise<void> {
  const { order, quote, paymentMethod, totalInc, deposit, freightPending, isTestMode } = args;
  const to = args.email;
  if (!to) return;

  const items = (quote.items ?? []) as Record<string, unknown>[];
  const [checkoutSettings, { site, channel }, branding] = await Promise.all([
    getCheckoutSettings(),
    getSiteConfig(),
    resolveEmailBranding(CHANNEL_ID).catch(() => undefined),
  ]);
  const method = checkoutSettings.paymentMethods.find((m) => m.id === paymentMethod);
  const siteUrl = siteBaseUrl(site?.url);
  const imageMap = await productImageService
    .primaryImageUrlsForProducts(items.map((i) => Number(i.product_id)))
    .catch(() => new Map<number, string>());

  const params = {
    orderId: order.id,
    orderNumber: order.order_number,
    storeName: branding?.storeName || site?.siteName || channel?.name || undefined,
    paymentMethod,
    // The ORDER is booked at the full GST-inclusive amount, so that is what
    // "Total" means here. When only a deposit is being taken, the deposit and
    // the balance are their OWN rows underneath — printing the deposit as the
    // Total told a customer their $14,721.63 order cost $7,360.82 and stated the
    // balance nowhere (card 0Wy0xHuq).
    total: totalInc.toFixed(2),
    deposit: deposit
      ? {
          label: depositLabel(deposit),
          dueNow: deposit.due_now.toFixed(2),
          balance: deposit.balance.toFixed(2),
        }
      : null,
    items: items.map((i) => ({
      name: (i.product_name as string) || "Item",
      quantity: (i.quantity as number) ?? 1,
      sku: (i.product_sku as string) ?? null,
      imageUrl: imageMap.get(Number(i.product_id)) ?? null,
      url: i.product_slug ? `${siteUrl}/products/${i.product_slug}` : null,
    })),
    bankDetails: method?.bankDetails ?? null,
    netTermsDays: args.netTermsDays ?? method?.netTermsDays ?? null,
    siteUrl,
    logoUrl: branding?.logoUrl ?? site?.logoUrl ?? null,
    logoAlt: branding?.logoAlt ?? site?.logoAlt ?? null,
    fromEmail: branding?.fromEmail ?? site?.fromEmail ?? null,
    brandColor: branding?.brandColor ?? null,
    footerText: branding?.footerText ?? null,
    // Steve: "When the invoice is sent, it should specify that the full amount
    // will also have to include 'Plus Freight'."
    notice: freightPending ? PLUS_FREIGHT_NOTICE : null,
    testMode: isTestMode,
  };

  await sendOrderConfirmationEmail({ to, ...params });

  const recipients = await resolveOrderNotificationRecipients(CHANNEL_ID).catch(() => []);
  if (recipients.length > 0) {
    await sendOrderStaffNotificationEmail({
      to: recipients,
      orderNumber: order.order_number,
      orderUrl: `${(process.env.PORTAL_BASE_URL || "https://keenan-group.com.au").replace(/\/$/, "")}/dashboard/orders/${order.id}`,
      customerEmail: to,
      customerName: null,
      total: totalInc.toFixed(2),
      deposit: deposit
        ? {
            label: depositLabel(deposit).replace("due now", "paid now"),
            dueNow: deposit.due_now.toFixed(2),
            balance: deposit.balance.toFixed(2),
          }
        : null,
      // The orders team sees the missing-freight warning on the alert itself,
      // not only on the separate no-freight email.
      notice: freightPending ? PLUS_FREIGHT_NOTICE : null,
      paymentMethod,
      storeName: site?.siteName || channel?.name || null,
      logoUrl: branding?.logoUrl ?? site?.logoUrl ?? null,
      logoAlt: branding?.logoAlt ?? site?.logoAlt ?? null,
      siteUrl: branding?.siteUrl ?? null,
      fromEmail: branding?.fromEmail ?? site?.fromEmail ?? null,
      brandColor: branding?.brandColor ?? null,
      bannerBgColor: branding?.bannerBgColor ?? null,
      footerText: branding?.footerText ?? null,
      items: items.map((i) => ({
        name: (i.product_name as string) || "Item",
        quantity: (i.quantity as number) ?? 1,
      })),
      testMode: isTestMode,
    });
  }
}

/**
 * Optimistic confirmation after `stripe.confirmCardPayment()` resolves on the
 * quote page. The portal Stripe webhook remains the source of truth for payment
 * status — this only advances the UI (and mirrors checkout's
 * `confirmStripePayment`, which additionally finalises the cart; a quote payment
 * has no cart to finalise).
 */
export async function confirmQuotePayment(
  orderNumber: string
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session?.contactId) return { success: false, error: "Not authenticated" };
  try {
    const orders = await orderService.list({
      page: 1,
      limit: 1,
      sort: "id",
      direction: "desc",
      filters: { order_number: { type: "eq", value: orderNumber } },
    });
    const order = orders.data[0] as { contact_id: number | null } | undefined;
    if (!order) return { success: false, error: "Order not found" };
    if (order.contact_id !== session.contactId) return { success: false, error: "Forbidden" };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to confirm" };
  }
  return { success: true };
}

/**
 * Channel tax mode, exposed for the quote page's summary. Kept here so the page
 * and this action read the same setting.
 */
export async function channelPricesIncludeTax(): Promise<boolean> {
  try {
    const s = await channelSettingsService.getByKey(CHANNEL_ID, "prices_include_tax");
    return s.setting_value === true || s.setting_value === "true";
  } catch {
    return false;
  }
}
