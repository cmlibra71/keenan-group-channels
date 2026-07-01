"use client";

import { useEffect, useRef } from "react";
import { trackStartedCheckout } from "./klaviyo";

/**
 * Fires Klaviyo's "Started Checkout" once when the checkout page mounts — the
 * higher-intent signal (vs. Added to Cart) that abandoned-checkout flows key off.
 * Renders nothing.
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
  }, [value, itemNames, items]);
  return null;
}
