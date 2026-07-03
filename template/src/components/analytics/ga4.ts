/**
 * Client-side GA4 ecommerce helpers (gtag.js). Safe to call before the tag loads —
 * gtag queues onto window.dataLayer and replays once ready. No-ops when GA4 isn't
 * configured (no measurement id ⇒ no gtag).
 *
 * Event names + item fields follow the GA4 recommended ecommerce spec so they
 * match the server-side Measurement Protocol events (worker) exactly — the
 * `purchase` transaction_id is shared so GA4 dedupes client + server.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: any[]) => void;
  }
}

export interface Ga4Item {
  item_id: string;
  item_name: string;
  item_brand?: string;
  item_category?: string;
  item_variant?: string;
  price?: number;
  quantity?: number;
  discount?: number;
  index?: number;
}

/**
 * Map a cart/listing row to a Ga4Item. Handles the portal's snake_case cart rows
 * (product_name / product_sku / variant_sku — service transformRow output) with
 * legacy `sku`/`name`/`price` fallbacks so any caller shape degrades gracefully.
 */
export function rowToGa4Item(raw: Record<string, unknown>, index: number): Ga4Item {
  const num = (v: unknown) => {
    const n = parseFloat(String(v ?? ""));
    return Number.isFinite(n) ? n : undefined;
  };
  return {
    item_id: String(
      raw.variant_sku ?? raw.product_sku ?? raw.sku ?? raw.product_id ?? raw.id ?? `item-${index}`
    ),
    item_name: String(raw.product_name ?? raw.name ?? "(unnamed)"),
    price: num(raw.sale_price) ?? num(raw.list_price) ?? num(raw.price),
    quantity: num(raw.quantity) ?? 1,
    index,
  };
}

function gtagEvent(name: string, params: Record<string, unknown>, attempt = 0): void {
  if (typeof window === "undefined") return;
  if (typeof window.gtag !== "function") {
    // Mount-time events (view_item / view_cart / begin_checkout) race Next's
    // afterInteractive gtag init on a fresh page load — retry until the tag is
    // ready (~10s cap) so they aren't silently dropped. Sending only after the
    // init script ran also guarantees config-before-event ordering. If GA4 is
    // not configured on this channel, gtag never appears and this no-ops out.
    if (attempt < 40) setTimeout(() => gtagEvent(name, params, attempt + 1), 250);
    return;
  }
  try {
    window.gtag("event", name, params);
  } catch {
    /* never let analytics break the page */
  }
}

export function ga4ViewItem(item: Ga4Item, currency = "AUD"): void {
  gtagEvent("view_item", { currency, value: item.price ?? 0, items: [item] });
}

export function ga4ViewItemList(items: Ga4Item[], listId?: string, listName?: string): void {
  gtagEvent("view_item_list", { item_list_id: listId, item_list_name: listName, items });
}

export function ga4SelectItem(item: Ga4Item, listId?: string, listName?: string): void {
  gtagEvent("select_item", { item_list_id: listId, item_list_name: listName, items: [item] });
}

export function ga4AddToCart(item: Ga4Item, currency = "AUD"): void {
  gtagEvent("add_to_cart", {
    currency,
    value: (item.price ?? 0) * (item.quantity ?? 1),
    items: [item],
  });
}

export function ga4RemoveFromCart(item: Ga4Item, currency = "AUD"): void {
  gtagEvent("remove_from_cart", {
    currency,
    value: (item.price ?? 0) * (item.quantity ?? 1),
    items: [item],
  });
}

export function ga4ViewCart(items: Ga4Item[], value: number, currency = "AUD"): void {
  gtagEvent("view_cart", { currency, value, items });
}

export function ga4BeginCheckout(items: Ga4Item[], value: number, currency = "AUD"): void {
  gtagEvent("begin_checkout", { currency, value, items });
}

export function ga4AddShippingInfo(items: Ga4Item[], value: number, shippingTier?: string, currency = "AUD"): void {
  gtagEvent("add_shipping_info", { currency, value, shipping_tier: shippingTier, items });
}

export function ga4AddPaymentInfo(items: Ga4Item[], value: number, paymentType?: string, currency = "AUD"): void {
  gtagEvent("add_payment_info", { currency, value, payment_type: paymentType, items });
}

export interface Ga4PurchaseInput {
  transactionId: string;
  value: number;
  tax?: number;
  shipping?: number;
  coupon?: string;
  currency?: string;
  items: Ga4Item[];
}

export function ga4Purchase(p: Ga4PurchaseInput): void {
  gtagEvent("purchase", {
    transaction_id: p.transactionId,
    value: p.value,
    tax: p.tax,
    shipping: p.shipping,
    coupon: p.coupon,
    currency: p.currency ?? "AUD",
    items: p.items,
  });
}
