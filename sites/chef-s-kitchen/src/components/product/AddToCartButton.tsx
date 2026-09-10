"use client";

import { useState, useTransition } from "react";
import { addToCart } from "@/lib/actions/cart";
import type { AddonSelectionInput } from "@keenan/services/product-addons";
import { useCartQuoteCounts, useHeaderPanels } from "@/lib/cart-quote-counts";
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
  addons,
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
  /** Paid extras the shopper ticked (card 0CDcCYmO), group key -> option keys. Keys only:
   *  the server re-reads every price from the product's own definition. */
  addons?: AddonSelectionInput;
}) {
  const [isPending, startTransition] = useTransition();
  const [refusal, setRefusal] = useState<string | null>(null);
  const { setCartCount } = useCartQuoteCounts();
  const { open } = useHeaderPanels();

  function handleClick() {
    setRefusal(null);
    startTransition(async () => {
      const res = await addToCart(productId, variantId, quantity ?? 1, addons);
      // Fresh count from the action → badge updates without a route re-render
      // (no-op on the provider-less /render/* surface). The same success branch
      // pops the cart panel out showing what was just added; a failed add
      // returns `{ error }` and leaves it closed.
      // A REFUSED ADD SAYS SO, and is not reported as a completed one.
      // `sf-product-page` / `sf-catalog-browse` [7bmpuqei, 7vu2iEEZ]: a control that
      // silently does nothing is the shape those rules forbid — and a refusal sent to
      // GA4 and Klaviyo as an `add_to_cart` corrupts every funnel that reads them.
      if (res && "error" in res && typeof res.error === "string") {
        setRefusal(res.error);
        return;
      }
      if (res && "cartCount" in res && typeof res.cartCount === "number") {
        setCartCount(res.cartCount);
        open("cart");
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
    <>
      <button
        onClick={handleClick}
        disabled={disabled || isPending}
        className={`btn-primary w-full ${size === "sm" ? "btn-sm" : ""}`}
      >
        {isPending ? "Adding..." : label ?? "Add to Cart"}
      </button>
      {refusal && (
        <p role="alert" className="mt-2 text-xs font-medium text-red-600">
          {refusal}
        </p>
      )}
    </>
  );
}
