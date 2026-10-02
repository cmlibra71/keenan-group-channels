"use client";

// ============================================================================
// "Add to Wishlist" under a listing tile — the sealed native `tile-wishlist`, inside the channel's
// `wishlist-tile` master, which hands it the row's id (`productId`, bound to `props.card.id`) and
// its words (`label_add`, optional `label_working`). No word is supplied here. It sits OUTSIDE the
// tile's link (see `builder/wishlist-node.ts`), so no control nests in an <a>.
// ============================================================================

import { wishlistWord } from "@/lib/wishlist/wishlist-copy";
import { useAddToWishlist } from "./use-add-to-wishlist";

export function WishlistTileLink(props: Record<string, unknown>) {
  const { add, pending, error } = useAddToWishlist(wishlistWord(props, "label_error"));
  const id = typeof props.productId === "number" ? props.productId : Number(props.productId);
  const label = wishlistWord(props, "label_add");
  if (!label || !Number.isInteger(id) || id <= 0) return null;
  const working = wishlistWord(props, "label_working") ?? label;
  return (
    <div className="mt-1 text-center" data-testid="tile-wishlist">
      <button
        type="button"
        onClick={() => add(id)}
        disabled={pending}
        aria-busy={pending}
        className="text-xs text-zinc-600 hover:text-zinc-900 hover:underline disabled:opacity-60"
        data-testid="tile-add-to-wishlist"
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
