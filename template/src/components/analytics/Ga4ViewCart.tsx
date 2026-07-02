"use client";

import { useEffect, useRef } from "react";
import { ga4ViewCart, type Ga4Item } from "./ga4";

/**
 * Fires GA4 `view_cart` once when the cart page mounts. Renders nothing.
 */
export function Ga4ViewCart({ value, items }: { value: number; items: Record<string, unknown>[] }) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    ga4ViewCart(items.map(toGa4Item), value);
  }, [value, items]);
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
