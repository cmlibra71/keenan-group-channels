"use client";

// ============================================================================
// "Add to Wishlist" on the product page — the sealed native `product-wishlist`.
//
// Sealed because it acts (a server action) and reads the page's live purchase state (the picked
// variation and quantity), which an authored tree cannot. Everything it PRINTS is a node prop on
// the channel's `wishlist-add` master (`label_add`, optional `label_working`) — no word is supplied
// here; with no `label_add` the control is not drawn. Placement and Show-if belong to the master
// and to `builder/wishlist-node.ts`.
// ============================================================================

import { useProductPurchaseOptional } from "@keenan/services/product-page";
import { wishlistWord } from "@/lib/wishlist/wishlist-copy";
import { useAddToWishlist } from "./use-add-to-wishlist";

export function WishlistButton(props: Record<string, unknown>) {
  const purchase = useProductPurchaseOptional();
  const { add, pending, error } = useAddToWishlist(wishlistWord(props, "label_error"));
  const explicit = typeof props.productId === "number" ? props.productId : Number(props.productId);
  const productId = Number.isInteger(explicit) && explicit > 0 ? explicit : Number(purchase?.product?.id);
  const label = wishlistWord(props, "label_add");
  if (!label || !Number.isInteger(productId) || productId <= 0) return null;
  const working = wishlistWord(props, "label_working") ?? label;
  // The variation the shopper has picked, when the picks match one — else the product itself.
  const variantId = purchase?.matchedVariant?.id ?? null;
  const quantity = purchase?.quantity ?? 1;

  return (
    <div className="flex flex-col items-center gap-1" data-testid="product-wishlist">
      <button
        type="button"
        onClick={() => add(productId, variantId, quantity)}
        disabled={pending}
        aria-busy={pending}
        className="text-sm text-zinc-700 underline-offset-2 hover:text-zinc-900 hover:underline disabled:opacity-60"
        data-testid="add-to-wishlist"
      >
        {pending ? working : label}
      </button>
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
