"use client";

import { useEffect, useRef } from "react";
import { trackStartedCheckout } from "./klaviyo";
import { ga4BeginCheckout, rowToGa4Item } from "./ga4";

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
    ga4BeginCheckout(items.map(rowToGa4Item), value);
  }, [value, itemNames, items]);
  return null;
}
