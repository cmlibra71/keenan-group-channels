"use client";

import { useEffect } from "react";
import { trackViewedProduct, type TrackedProduct } from "./klaviyo";

/**
 * Fires Klaviyo's "Viewed Product" once when a product page mounts — the signal
 * that powers browse-abandonment flows and product recommendations. Renders
 * nothing; drop it into the product detail page with the product's fields.
 */
export function ViewedProductTracker({ product }: { product: TrackedProduct }) {
  useEffect(() => {
    trackViewedProduct(product);
    // Only re-fire when the product identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);
  return null;
}
