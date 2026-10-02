"use client";
import type { NativeComponents } from "@keenan/services/builder-react";
import { TileCompare } from "@/components/product/TileCompare";
import { TILE_COMPARE_KEY } from "./tile-compare-node";
import { WishlistTileLink } from "@/components/wishlist/WishlistTileLink";
import { WISHLIST_TILE_NATIVE } from "@/builder/wishlist-node";

// Industry Kitchens seals nothing on the brand page any more — bar the tile's
// "Add to Compare" control below.
//
// `brand-products` used to be registered here — a client copy of the Products
// section, standing in until the section itself was authored. The brand tree
// now lays out that grid in nodes and places the shared `product-card` master,
// so the registration became dead code, and a dead native is not harmless:
// natives WIN over masters by key, so leaving it would silently un-explode the
// grid the moment anyone minted a `brand-products` master.
//
// The signature stays so the wrapper keeps its seam — a site that does need a
// sealed leaf here fills this in.
export function brandNatives(_args: {
  products: unknown[];
  pricing: Record<string, unknown>;
  memberPricingAvailable: boolean;
  brandSlug?: string;
  brandName?: string;
}): NativeComponents {
  void _args;
  return {
    // "Add to Compare" under each brand-page tile (IK parity, compare-feature) — the same
    // control and placement as the category page (`builder/tile-compare-node.ts`).
    [TILE_COMPARE_KEY]: (props: Record<string, unknown>) => <TileCompare productId={props.productId} />,
    // "Add to Wishlist" under a tile — inside the channel's `wishlist-tile` CMS master, which holds
    // its words and its Show-if (`builder/wishlist-node.ts`; placed only while `wishlist_enabled`).
    [WISHLIST_TILE_NATIVE]: (props: Record<string, unknown>) => <WishlistTileLink {...props} />,
  };
}
