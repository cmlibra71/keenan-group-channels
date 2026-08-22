// ============================================================================
// Order draft — the pure computational core of placeOrder.
//
// "Numbers + cart rows in, order draft out." No DB, no cookies, no session, no
// Stripe — so every healed checkout scar (unit-price selection, per-line GST,
// subtotal roll-up, shipping split, payment-status mapping) is a table-driven
// unit test (see order-draft.test.ts) instead of an end-to-end checkout walk.
//
// The imperative shell (lib/actions/checkout.ts placeOrder) still owns all the
// side-effects and the impure shipping-rate lookup; it sequences:
//   build line items -> (impure) quote shipping off subtotal.exTax -> withShipping.
//   The rate that lookup returns is EX-GST and withShipping adds GST on top of it.
//
// Tax arithmetic is delegated to @keenan/services `gstSplit` (the single source
// of truth for GST math, shared with the pricing engine + cart totals — services
// CONTEXT.md D4). Do not re-implement the `subtotal / 1.1 * 0.1` formula here or
// at any call site.
// ============================================================================

import { gstSplit } from "@keenan/services/calc";
import { backorderedUnits, type StockFacts } from "@keenan/services/backorder";

export type PaymentStatus = "pending" | "awaiting_payment" | "pending_payment" | "net_terms";

/**
 * Maps a checkout payment method to the order's initial payment status.
 * Unknown / empty methods fall back to "pending" (matching the prior inline
 * default in placeOrder).
 *
 * SilverChef and Finance land exactly where Bank Transfer lands: the order is
 * PLACED UNPAID and nothing is charged until the finance settles (Tim + Chris,
 * card VAjaPj0t, 2026-08-11). `pending_payment` is what `initialOrderStatus`
 * turns into the Zoey status "Pending Payment" — the customer reads "Placed".
 * The ids are spelled out rather than imported so this module stays pure
 * arithmetic with no service-layer dependency; @keenan/services
 * `FINANCE_METHOD_IDS` is the same pair.
 */
export function determinePaymentStatus(paymentMethod: string): PaymentStatus {
  switch (paymentMethod) {
    case "stripe":
      return "awaiting_payment";
    case "bank_transfer":
    case "silverchef":
    case "finance":
      return "pending_payment";
    case "net_terms":
      return "net_terms";
    default:
      return "pending";
  }
}

/** The charged unit price: the catalog/member sale price when present, else RRP. */
export function lineUnitPrice(item: { sale_price: string | null; list_price: string }): number {
  return item.sale_price ? parseFloat(item.sale_price) : parseFloat(item.list_price);
}

/** Snake_case cart-line shape consumed here (a subset of cartService.getWithItems items). */
export type CartLineInput = {
  product_id: number;
  variant_id: number | null;
  product_name: string;
  product_sku: string | null;
  quantity: number;
  list_price: string;
  sale_price: string | null;
};

/** A line item ready for orderItemService.createManyForParent (camelCase contract). */
export type OrderLineDraft = {
  productId: number;
  variantId: number | null;
  name: string;
  sku: string | null;
  quantity: number;
  basePrice: string;
  priceExTax: string;
  priceIncTax: string;
  priceTax: string;
  baseTotal: string;
  totalExTax: string;
  totalIncTax: string;
  totalTax: string;
  /**
   * Buy cost AT TIME OF SALE, ex GST — set by `withLineCosts` from the same cost
   * map the below-cost sentry already reads. Omitted (never 0) when no cost is
   * known, so the portal's below-floor report never mistakes "unknown" for "free".
   */
  baseCostPrice?: string;
  costPriceExTax?: string;
  /**
   * Units of this line NOT in stock when the order was placed — Zoey's item status "Backordered"
   * (card 7vu2iEEZ). Set by `withBackorderedQuantities` and omitted (never 0) on a line that is
   * fully in stock, so the portal can tell "none on back order" from "we never worked it out" on
   * every order placed before this shipped.
   */
  backorderedQuantity?: number;
};

export type MoneySplit = { exTax: number; incTax: number; tax: number };

export type LineItemsDraft = {
  subtotal: MoneySplit;
  itemsTotal: number;
  lineItems: OrderLineDraft[];
};

/**
 * Builds the order line items and subtotal in a single pass. Shipping-independent
 * (the shipping rate lookup needs subtotal.exTax as input — see withShipping), so
 * this runs first.
 */
export function buildLineItems(items: CartLineInput[], pricesIncludeTax: boolean): LineItemsDraft {
  let subExTax = 0;
  let subTax = 0;
  let subIncTax = 0;
  let itemsTotal = 0;

  const lineItems = items.map<OrderLineDraft>((item) => {
    const unitPrice = lineUnitPrice(item);
    const linePrice = unitPrice * item.quantity;
    const unitCalc = gstSplit(unitPrice, pricesIncludeTax);
    const lineCalc = gstSplit(linePrice, pricesIncludeTax);

    subExTax += lineCalc.exTax;
    subTax += lineCalc.tax;
    subIncTax += lineCalc.incTax;
    itemsTotal += item.quantity;

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

  return {
    subtotal: { exTax: subExTax, incTax: subIncTax, tax: subTax },
    itemsTotal,
    lineItems,
  };
}

/** A line about to be sold under its current buy cost (all figures ex-GST). */
export type BelowCostLine = {
  productId: number;
  variantId: number | null;
  sku: string | null;
  name: string;
  quantity: number;
  unitExTax: number;
  cost: number;
};

/**
 * Below-cost sentry: lines whose charged ex-GST unit price is under the CURRENT
 * buy cost. The pricing engine already floors computed prices at cost, but a
 * price frozen on the cart line can drift under a later cost update, and manual
 * prices (account contracts, imported specials) bypass the engine entirely.
 * `costs` is keyed `${productId}:${variantId ?? 0}` (see store.getLineCosts);
 * lines with no known cost are skipped. A half-cent tolerance avoids flagging
 * pure GST-split rounding noise.
 */
export function findBelowCostLines(
  lineItems: OrderLineDraft[],
  costs: Map<string, number>
): BelowCostLine[] {
  const out: BelowCostLine[] = [];
  for (const line of lineItems) {
    const cost = costs.get(`${line.productId}:${line.variantId ?? 0}`);
    if (cost == null) continue;
    const unitExTax = parseFloat(line.priceExTax);
    if (!Number.isFinite(unitExTax)) continue;
    if (unitExTax < cost - 0.005) {
      out.push({
        productId: line.productId,
        variantId: line.variantId,
        sku: line.sku,
        name: line.name,
        quantity: line.quantity,
        unitExTax,
        cost,
      });
    }
  }
  return out;
}

/**
 * Freeze the buy cost onto each line so the order records what it cost US at the
 * time of sale. Costs move; without this the portal's minimum-margin-floor
 * report would have to re-derive every historic order's margin from TODAY's
 * cost, which is simply a different number.
 *
 * `costs` is the SAME map `findBelowCostLines` reads (keyed
 * `${productId}:${variantId ?? 0}` — see store.getLineCosts). Lines with no
 * known cost, or a non-positive one, come back untouched: an absent cost must
 * stay absent rather than being written as 0, which would read as "free".
 *
 * Pure — returns new drafts, mutates nothing.
 */
export function withLineCosts(
  lineItems: OrderLineDraft[],
  costs: Map<string, number>
): OrderLineDraft[] {
  return lineItems.map((line) => {
    const cost = costs.get(`${line.productId}:${line.variantId ?? 0}`);
    if (cost == null || !Number.isFinite(cost) || cost <= 0) return line;
    const asString = String(cost);
    return { ...line, baseCostPrice: asString, costPriceExTax: asString };
  });
}

/**
 * Stamp each line with the units that were not on the shelf when the order was placed
 * (card 7vu2iEEZ, Tim 2026-08-11: "it needs to be shown in the item status for the order").
 *
 * Done ONCE, here, at order time. The portal never recomputes it: stock moves every night, so a
 * derived answer would quietly change what the order says the customer was told, and Zoey's own
 * behaviour is that the line reads Backordered until it ships.
 *
 * A line under a product set to stay quiet about back orders is still stamped — the shopper was
 * not told, but the warehouse and the sales desk still have to know.
 */
export function withBackorderedQuantities(
  lineItems: OrderLineDraft[],
  stock: Map<number, StockFacts>
): OrderLineDraft[] {
  return lineItems.map((line) => {
    const facts = stock.get(line.productId);
    if (!facts) return line;
    const units = backorderedUnits(facts, line.quantity);
    return units > 0 ? { ...line, backorderedQuantity: units } : line;
  });
}

/** One line's member saving: what a non-member would have paid for the same line. */
export type MemberSavingLine = {
  productId: number;
  variantId: number | null;
  sku: string | null;
  quantity: number;
  /** Non-member unit price (the line's list price — RRP is what a non-member pays here). */
  nonMemberUnit: number;
  /** What the member was actually charged per unit. */
  chargedUnit: number;
};

export type MemberSavings = {
  savedExTax: number;
  savedIncTax: number;
  lines: MemberSavingLine[];
};

/**
 * What this order saved the shopper by being a MEMBER, computed at the moment of
 * sale (card pgRmsaTX).
 *
 * Nothing before this recorded it — only the price paid was ever stored — so staff
 * could answer "what have I saved?" only with an estimate against today's prices.
 * From here on the comparison is frozen onto the order.
 *
 * The non-member price is the line's LIST price, because that is exactly what a
 * Chefs Depot non-member is charged: the channel suppresses the shared catalogue
 * sale price and the bulk tiers, so RRP is the non-member price (see
 * `resolveItemPricing` / `shouldSuppressCatalogSalePrice`). A line charged at or
 * above list saved nothing and is left out rather than counted as zero, so the
 * stamped lines are only the ones the saving is made of.
 *
 * Pure — the caller decides whether this shopper is a member at all.
 */
export function memberSavings(
  items: CartLineInput[],
  pricesIncludeTax: boolean
): MemberSavings {
  const lines: MemberSavingLine[] = [];
  let savedRaw = 0;

  for (const item of items) {
    const list = parseFloat(item.list_price);
    const charged = lineUnitPrice(item);
    if (!Number.isFinite(list) || !Number.isFinite(charged)) continue;
    const perUnit = list - charged;
    // Half a cent of tolerance, matching the below-cost sentry: GST-split rounding
    // noise is not a saving.
    if (perUnit <= 0.005) continue;
    savedRaw += perUnit * item.quantity;
    lines.push({
      productId: item.product_id,
      variantId: item.variant_id,
      sku: item.product_sku,
      quantity: item.quantity,
      nonMemberUnit: list,
      chargedUnit: charged,
    });
  }

  const split = gstSplit(savedRaw, pricesIncludeTax);
  return {
    savedExTax: round2(split.exTax),
    savedIncTax: round2(split.incTax),
    lines,
  };
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Splits a delivery charge and rolls it into the order total. Returns the shipping
 * split and the combined subtotal + shipping total.
 *
 * The amount is EX-GST, because a shipping rate card states EX-GST figures and GST is
 * added on top of them — $30.00 ex is $33.00 inc (Tim, card twwZMnMY; and the Product
 * Brief's "freight CHARGED and freight COST are both ex GST wherever they meet"). This
 * used to take an INC-tax amount and back the GST out of the rate, which billed a $30
 * flat rate as $27.27 + $2.73 and under-charged every delivery by 10%.
 *
 * It is the same basis the portal already uses: a quote's `shipping_cost` is ex-GST and
 * `quotes/convert.ts` splits it with `inclusive: false`, so a quote converted to an order
 * and a storefront checkout now bill one rate card identically.
 */
export function withShipping(
  subtotal: MoneySplit,
  shippingExTax: number
): { shipping: MoneySplit; total: MoneySplit } {
  const s = gstSplit(shippingExTax, false);
  const shipping: MoneySplit = { exTax: s.exTax, incTax: s.incTax, tax: s.tax };
  return {
    shipping,
    total: {
      exTax: subtotal.exTax + shipping.exTax,
      incTax: subtotal.incTax + shipping.incTax,
      tax: subtotal.tax + shipping.tax,
    },
  };
}
