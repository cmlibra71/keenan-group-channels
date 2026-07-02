"use client";

import { useEffect } from "react";
import { trackViewedProduct, type TrackedProduct } from "./klaviyo";
import { ga4ViewItem } from "./ga4";

/**
 * Fires the product-view signals once when a product page mounts — Klaviyo's
 * "Viewed Product" (browse-abandonment) AND GA4's `view_item`. Renders nothing.
 */
export function ViewedProductTracker({ product }: { product: TrackedProduct }) {
  useEffect(() => {
    trackViewedProduct(product);
    ga4ViewItem({
      item_id: product.sku || String(product.id),
      item_name: product.name,
      item_brand: product.brand ?? undefined,
      item_category: product.categories?.[0],
      price: product.price ?? undefined,
      quantity: 1,
    });
    // Only re-fire when the product identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);
  return null;
}
