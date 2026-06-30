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
//
// Tax arithmetic is delegated to @keenan/services `gstSplit` (the single source
// of truth for GST math, shared with the pricing engine + cart totals — services
// CONTEXT.md D4). Do not re-implement the `subtotal / 1.1 * 0.1` formula here or
// at any call site.
// ============================================================================

import { gstSplit } from "@keenan/services/calc";

export type PaymentStatus = "pending" | "awaiting_payment" | "pending_payment" | "net_terms";

/**
 * Maps a checkout payment method to the order's initial payment status.
 * Unknown / empty methods fall back to "pending" (matching the prior inline
 * default in placeOrder).
 */
export function determinePaymentStatus(paymentMethod: string): PaymentStatus {
  switch (paymentMethod) {
    case "stripe":
      return "awaiting_payment";
    case "bank_transfer":
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

/**
 * Splits a shipping amount (always specified inc-tax) and rolls it into the order
 * total. Returns the shipping split and the combined subtotal + shipping total.
 */
export function withShipping(
  subtotal: MoneySplit,
  shippingIncTax: number
): { shipping: MoneySplit; total: MoneySplit } {
  const s = gstSplit(shippingIncTax, true);
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
