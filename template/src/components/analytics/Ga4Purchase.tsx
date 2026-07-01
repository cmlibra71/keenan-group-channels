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

/**
 * Fires GA4 `purchase` once on the order-confirmation page — captures the browser
 * session/client_id that the server-side Measurement Protocol event can't. Shares
 * the order-number transaction_id with the server event, so GA4 dedupes the two.
 * Renders nothing; no-ops if there's no value.
 */
export function Ga4Purchase(props: Ga4PurchaseProps) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current || !props.transactionId || !(props.value > 0)) return;
    fired.current = true;
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
