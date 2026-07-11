"use client";

import { useTransition } from "react";
import { addToCart } from "@/lib/actions/cart";
import { useCartQuoteCounts } from "@/lib/cart-quote-counts";
import { trackAddedToCart } from "@/components/analytics/klaviyo";
import { ga4AddToCart } from "@/components/analytics/ga4";

export function AddToCartButton({
  productId,
  variantId,
  disabled,
  size,
  label,
  quantity,
  productName,
  price,
  sku,
  brandName,
  categoryName,
}: {
  productId: number;
  variantId?: number | null;
  disabled?: boolean;
  size?: "sm";
  label?: string;
  quantity?: number;
  /** Optional enrichment for the Klaviyo "Added to Cart" / GA4 add_to_cart events. */
  productName?: string;
  price?: number | null;
  sku?: string | null;
  brandName?: string;
  categoryName?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const { setCartCount } = useCartQuoteCounts();

  function handleClick() {
    startTransition(async () => {
      const res = await addToCart(productId, variantId, quantity ?? 1);
      // The action returns the fresh count — the header badge updates without
      // any route re-render (no-op on the provider-less /render/* surface).
      if (res && "cartCount" in res && typeof res.cartCount === "number") {
        setCartCount(res.cartCount);
      }
      // Fire client-side so browse/cart-abandonment flows see it (server actions can't).
      trackAddedToCart({
        id: productId,
        sku: sku ?? null,
        name: productName ?? `Product ${productId}`,
        price: price ?? null,
        quantity: quantity ?? 1,
      });
      ga4AddToCart({
        item_id: sku ?? String(productId),
        item_name: productName ?? `Product ${productId}`,
        item_brand: brandName,
        item_category: categoryName,
        price: price ?? undefined,
        quantity: quantity ?? 1,
      });
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={disabled || isPending}
      className={`w-full bg-zinc-900 text-white rounded-lg font-semibold hover:bg-zinc-800 transition-colors disabled:bg-zinc-300 disabled:cursor-not-allowed ${
        size === "sm" ? "py-2 px-4 text-sm" : "py-3 px-6"
      }`}
    >
      {isPending ? "Adding..." : label ?? "Add to Cart"}
    </button>
  );
}
