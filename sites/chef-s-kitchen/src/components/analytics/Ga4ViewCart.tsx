"use client";

import { useEffect, useRef } from "react";
import { ga4ViewCart, rowToGa4Item } from "./ga4";

/**
 * Fires GA4 `view_cart` once when the cart page mounts. Renders nothing.
 */
export function Ga4ViewCart({ value, items }: { value: number; items: Record<string, unknown>[] }) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    ga4ViewCart(items.map(rowToGa4Item), value);
  }, [value, items]);
  return null;
}
