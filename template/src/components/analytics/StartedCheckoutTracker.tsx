"use client";

import { useEffect, useRef } from "react";
import { trackStartedCheckout } from "./klaviyo";
import { ga4BeginCheckout, type Ga4Item } from "./ga4";

/**
 * Fires the checkout-start signals once when the checkout page mounts — Klaviyo's
 * "Started Checkout" AND GA4's `begin_checkout`. Renders nothing.
 */
export function StartedCheckoutTracker({
  value,
  itemNames,
  items,
}: {
  value: number;
  itemNames: string[];
  items: Record<string, unknown>[];
}) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    trackStartedCheckout({ value, itemNames, items });
    ga4BeginCheckout(items.map(toGa4Item), value);
  }, [value, itemNames, items]);
  return null;
}

function toGa4Item(raw: Record<string, unknown>, index: number): Ga4Item {
  const num = (v: unknown) => {
    const n = parseFloat(String(v ?? ""));
    return Number.isFinite(n) ? n : undefined;
  };
  return {
    item_id: String(raw.sku ?? raw.product_id ?? `item-${index}`),
    item_name: String(raw.name ?? "(unnamed)"),
    price: num(raw.sale_price) ?? num(raw.list_price) ?? num(raw.price),
    quantity: num(raw.quantity) ?? 1,
    index,
  };
}
