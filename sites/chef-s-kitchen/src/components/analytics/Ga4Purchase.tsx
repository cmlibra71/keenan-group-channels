"use client";

import { useEffect, useRef } from "react";
import { ga4Purchase, type Ga4Item } from "./ga4";

export interface Ga4PurchaseProps {
  transactionId: string;
  value: number;
  tax?: number;
  shipping?: number;
  currency?: string;
  coupon?: string;
  items?: Ga4Item[];
}

const SENT_KEY_PREFIX = "ga4_purchase_sent:";

/**
 * Fires GA4 `purchase` at most once per order — captures the browser
 * session/client_id for attribution (the server-side Measurement Protocol event
 * can't). GA4 does NOT deduplicate purchases by transaction_id (that was
 * Universal Analytics); every delivery is counted, so re-firing inflates item
 * quantity + revenue. We therefore persist a per-transaction marker in
 * localStorage and fire once ever on this device — surviving reloads, revisits
 * and back-navigation to the confirmation page. The in-mount ref is just a cheap
 * first guard for storage-less (private-mode) browsers.
 *
 * This is the sole client-owned purchase source; keep the channel's server-side
 * MP `purchase` OFF (a second delivery under a different client_id would
 * double-count — GA4 won't merge them). Renders nothing; no-ops if there's no value.
 */
export function Ga4Purchase(props: Ga4PurchaseProps) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current || !props.transactionId || !(props.value > 0)) return;

    const key = SENT_KEY_PREFIX + props.transactionId;
    try {
      if (window.localStorage.getItem(key)) {
        fired.current = true; // already sent for this order on an earlier load
        return;
      }
    } catch {
      // storage unavailable (private mode) — fall through and fire once per mount
    }

    // Mark BEFORE sending so a re-render/revisit can't race a second delivery.
    fired.current = true;
    try {
      window.localStorage.setItem(key, String(Date.now()));
    } catch {
      // ignore — analytics must never break the page
    }

    ga4Purchase({
      transactionId: props.transactionId,
      value: props.value,
      tax: props.tax,
      shipping: props.shipping,
      currency: props.currency,
      coupon: props.coupon,
      items: props.items ?? [],
    });
  }, [props]);
  return null;
}
