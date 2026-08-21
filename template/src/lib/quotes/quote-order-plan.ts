/**
 * Quote → Order derivation for a CUSTOMER-paid quote (card 0Wy0xHuq).
 *
 * The storefront mirror of the portal's `src/lib/quotes/convert.ts`
 * `planOrderFromQuote`. Same money, same shapes, same GST rule — a quote a
 * customer pays online must produce exactly the order a staff member would have
 * produced by converting it in the portal, or the two paths would book different
 * numbers against the same document.
 *
 * Pure: numbers + rows in, an order draft out. Every GST split flows through
 * `gstSplit` / `quoteGstTotals` (quote-gst.ts), never re-derived inline — inline
 * arithmetic is exactly how GST once got dropped on every converted order.
 *
 * KNOWN NARROWING vs the portal planner, deliberate and recorded: file-valued
 * quote attributes (spec sheets, proof-of-payment slots) do not carry across
 * here. They are a staff-conversion nicety, the storefront has no file-slot
 * renderer, and copying half of one would be worse than copying none. Scalar
 * copy-to-order attributes DO carry, so the Order Information panel reads the
 * same values either way.
 */
import { gstSplit } from "@keenan/services/calc";
import { quoteGstTotals, MONEY_EPSILON, type QuoteGstInput } from "./quote-gst";
import { resolveQuoteTotal } from "./price-visibility";

/** A snake_case quote row from `quoteService.getWithItems`. */
export type PlannableQuote = Record<string, unknown> &
  QuoteGstInput & {
    items?: Record<string, unknown>[];
  };

/** Coerce a loosely-typed money value to a finite number, defaulting to 0. */
function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

/** `gstSplit` as the 4dp strings the orders schema stores. */
function split4(amount: unknown, rate: number, inclusive: boolean) {
  const s = gstSplit(num(amount), inclusive, rate);
  return { ex: s.exTax.toFixed(4), inc: s.incTax.toFixed(4), tax: s.tax.toFixed(4) };
}

export interface PlannedOrder {
  channel_id: unknown;
  account_id: unknown;
  contact_id: unknown;
  currency_code: string;
  status: string;
  subtotal_ex_tax: string;
  subtotal_inc_tax: string;
  shipping_cost_ex_tax: string;
  shipping_cost_inc_tax: string;
  discount_amount: string;
  gift_certificate_amount: string;
  store_credit_amount: string;
  total_ex_tax: string;
  total_inc_tax: string;
  total_tax: string;
  billing_address: Record<string, unknown>;
  customer_message: unknown;
  internal_memo: string | null;
  metafields: Record<string, unknown>;
}

export interface PlannedOrderItem {
  source_item_id: number;
  payload: {
    product_id: unknown;
    variant_id: unknown;
    name: string;
    sku: string | null;
    quantity: unknown;
    base_price: string;
    price_ex_tax: string;
    price_inc_tax: string;
    price_tax: string;
    base_total: string;
    total_ex_tax: string;
    total_inc_tax: string;
    total_tax: string;
    discount_amount: string;
  };
}

/** Values for the `order_shipping_addresses` insert (camelCase drizzle columns), sans orderId. */
export interface PlannedShipTo {
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  address1: string;
  address2: string | null;
  city: string;
  stateOrProvince: string | null;
  postalCode: string | null;
  country: string;
  countryCode: string | null;
  email: string | null;
  phone: string | null;
  shippingMethod: string | null;
  baseCost: string;
  costExTax: string;
  costIncTax: string;
  costTax: string;
}

export interface QuoteOrderPlan {
  order: PlannedOrder;
  items: PlannedOrderItem[];
  shipTo: PlannedShipTo | null;
  /** True when the quote carried no freight at all — drives the orders-team alert. */
  freightPending: boolean;
}

export interface QuotePlanContext {
  /** GST as a fraction of ex-tax (0.1 = 10%), from the quote's tax class. */
  gstRate: number;
  /** Attribute codes flagged "copy to order" for this channel. Empty ⇒ carry none. */
  copyAttributeCodes?: Set<string>;
  /**
   * The delivery address to write, when the quote itself carries none. Already
   * checkout-shaped (the customer's saved address). Never overrides the quote's
   * own address: a quote's agreed ship-to is not a customer's to change.
   */
  fallbackShipTo?: Omit<
    PlannedShipTo,
    "shippingMethod" | "baseCost" | "costExTax" | "costIncTax" | "costTax"
  > | null;
  /** Billing address when the quote carries none (falls back to the ship-to). */
  fallbackBilling?: Record<string, unknown> | null;
}

/** A rendered scalar for the order's metafields / memo. Objects and lists are skipped. */
function scalarText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) {
    return v.every((e) => typeof e === "string" || typeof e === "number")
      ? v.join(", ")
      : "";
  }
  if (typeof v === "object") return "";
  return String(v);
}

/** Copy-to-order attribute values, keyed by code — scalars only (see file header). */
export function buildOrderMetafields(
  quote: PlannableQuote,
  copyCodes: Set<string>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const attrs = quote.attributes as Record<string, unknown> | null | undefined;
  if (!attrs) return out;
  for (const [code, value] of Object.entries(attrs)) {
    if (!copyCodes.has(code)) continue;
    const text = scalarText(value);
    if (text) out[code] = text;
  }
  return out;
}

/** The order's internal memo: the quote's internal notes plus its per-line notes. */
export function buildInternalMemo(quote: PlannableQuote, items: Record<string, unknown>[]): string | null {
  const lineNotes = items
    .filter((it) => it.customer_notes)
    .map(
      (it) =>
        `${(it.sku as string) || (it.product_sku as string) || (it.product_name as string) || "item"}: ${it.customer_notes}`
    );
  return (
    [
      (quote.internal_notes as string) || null,
      lineNotes.length ? `— Carried from quote —\nLine notes: ${lineNotes.join(" | ")}` : null,
    ]
      .filter(Boolean)
      .join("\n") || null
  );
}

/** True when the shipping-address bag actually holds something. */
function hasAny(bag: Record<string, unknown> | null | undefined): boolean {
  return !!bag && Object.values(bag).some((v) => v !== null && v !== undefined && v !== "");
}

/**
 * Plan the order, its lines and its ship-to from a quote the customer is paying.
 *
 * The grand total comes from {@link quoteGstTotals}, NOT from re-adding the lines:
 * that view is what the customer's quote page, PDF and email all print, and it is
 * the only thing that reads a Zoey-ingested quote's mixed basis (GST-inclusive
 * grand total over ex-GST lines) correctly, and surfaces the freight Zoey folds
 * into that total with no column of its own.
 */
export function planOrderFromPaidQuote(
  quote: PlannableQuote,
  ctx: QuotePlanContext
): QuoteOrderPlan {
  const items = quote.items ?? [];
  const taxInclusive = quote.tax_inclusive === true;
  const split = (v: unknown) => split4(v, ctx.gstRate, taxInclusive);

  const subtotalT = split(quote.base_amount);
  // The SAME view the quote page, the emailed quote and the PDF all print, so the
  // order can never disagree with the document it came from — including the
  // freight a Zoey grand total carries with no shipping_cost of its own.
  const view = quoteGstTotals(resolveQuoteTotal(quote) ?? 0, quote, ctx.gstRate);
  const shippingT = split4(view.freightEx, ctx.gstRate, false);
  // STORE CREDIT ON A CONVERTING QUOTE (card vkYOSmJj). `view.exTax/incTax` are
  // what the quote CHARGES, before the credit; `payableInc` is what the
  // customer's copy of the quote — and the Pay button above — asks them for, so
  // that is what the order has to bill. It is split at the order's own GST rate,
  // which is exactly how the ORDER surface already treats a credit when an order
  // is amended (portal `recomputeAmendedTotals`: an inclusive settlement whose
  // GST comes off proportionally), so the order it creates is the order the
  // portal's `planOrderFromQuote` creates from the same quote. `store_credit_amount`
  // still travels onto the order, so the credit itself is recorded.
  const totalT =
    view.creditInc > MONEY_EPSILON
      ? split4(view.payableInc, ctx.gstRate, true)
      : { ex: view.exTax.toFixed(4), inc: view.incTax.toFixed(4), tax: view.tax.toFixed(4) };
  const lineDiscount = num(quote.discount_amount);
  const coupon = num(quote.coupon_discount);

  const quoteShip = quote.shipping_address as Record<string, string | null | undefined> | null;
  const quoteBilling = quote.billing_address as Record<string, unknown> | null;
  const billing = hasAny(quoteBilling)
    ? (quoteBilling as Record<string, unknown>)
    : (ctx.fallbackBilling ?? {});

  const order: PlannedOrder = {
    channel_id: quote.channel_id,
    account_id: quote.account_id ?? null,
    contact_id: quote.contact_id ?? null,
    currency_code: (quote.currency_code as string) || "AUD",
    status: "pending",
    subtotal_ex_tax: subtotalT.ex,
    subtotal_inc_tax: subtotalT.inc,
    shipping_cost_ex_tax: shippingT.ex,
    shipping_cost_inc_tax: shippingT.inc,
    discount_amount: (lineDiscount + coupon).toFixed(4),
    gift_certificate_amount: String(quote.gift_certificate_amount ?? "0"),
    store_credit_amount: String(quote.store_credit_amount ?? "0"),
    total_ex_tax: totalT.ex,
    total_inc_tax: totalT.inc,
    total_tax: totalT.tax,
    billing_address: billing,
    customer_message: quote.customer_notes ?? null,
    internal_memo: buildInternalMemo(quote, items),
    metafields: buildOrderMetafields(quote, ctx.copyAttributeCodes ?? new Set()),
  };

  const plannedItems: PlannedOrderItem[] = items.map((it) => {
    const listPrice = String(it.list_price ?? "0");
    const salePrice = it.sale_price ? String(it.sale_price) : listPrice;
    const extList = String(it.extended_list_price ?? "0");
    const extSale = it.extended_sale_price ? String(it.extended_sale_price) : extList;
    const unitT = split(salePrice);
    const extT = split(extSale);
    return {
      source_item_id: Number(it.id),
      payload: {
        product_id: it.product_id,
        variant_id: it.variant_id ?? null,
        name: (it.name as string) || (it.product_name as string) || "Item",
        sku:
          (it.sku as string) ||
          (it.variant_sku as string) ||
          (it.product_sku as string) ||
          null,
        quantity: it.quantity ?? 1,
        base_price: listPrice,
        price_ex_tax: unitT.ex,
        price_inc_tax: unitT.inc,
        price_tax: unitT.tax,
        base_total: extList,
        total_ex_tax: extT.ex,
        total_inc_tax: extT.inc,
        total_tax: extT.tax,
        discount_amount: String(it.discount_amount ?? "0"),
      },
    };
  });

  // The quote's own ship-to wins, always: the customer may not change an agreed
  // delivery address (Steve, card 0Wy0xHuq — "Staff can change address, customers
  // can't"). The fallback only fills a quote that never carried one.
  let shipTo: PlannedShipTo | null = null;
  const freightMoney = {
    shippingMethod: (quote.shipping_method as string) ?? null,
    baseCost: view.freightEx.toFixed(4),
    costExTax: shippingT.ex,
    costIncTax: shippingT.inc,
    costTax: shippingT.tax,
  };
  if (hasAny(quoteShip)) {
    const s = quoteShip!;
    shipTo = {
      firstName: s.first_name ?? null,
      lastName: s.last_name ?? null,
      company: s.company ?? null,
      address1: s.street1 ?? s.address1 ?? "",
      address2: s.street2 ?? s.address2 ?? null,
      city: s.city ?? "",
      stateOrProvince: s.region ?? s.state_or_province ?? null,
      postalCode: s.postcode ?? s.postal_code ?? null,
      country: s.country ?? "AU",
      countryCode: s.country_code ?? null,
      email: s.email ?? null,
      phone: s.phone ?? s.telephone ?? null,
      ...freightMoney,
    };
  } else if (ctx.fallbackShipTo) {
    shipTo = { ...ctx.fallbackShipTo, ...freightMoney };
  }

  return {
    order,
    items: plannedItems,
    shipTo,
    // A quote with no freight is payable as it stands (only a handful of quotes
    // in the whole system carry any), but the orders team must be told and the
    // invoice must say "Plus Freight".
    freightPending: Math.abs(view.freightEx) < 0.005,
  };
}
