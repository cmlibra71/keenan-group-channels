import type { NodeTree, BuilderNode } from "@keenan/services/builder";
import { readListingSettings } from "@keenan/services/builder";

// ============================================================================
// The brand RANGE page's product grid — Industry Kitchens only (IK parity,
// product cards, brand-category pages).
//
// `/brands/<brand>/<range>` (2,691 legacy addresses, e.g. /brands/fagor/deep-fryers-3)
// is a Zoey CATEGORY list on the old site, so its tiles follow the same rules as the
// category and brand pages: Add to Quote / Add to Basket / View Details, the quantity
// box, the SALE flag, the price suffix, "Starting From:", compare — per the page's own
// Zoey list switches. Those rules live in ONE stored master, `product-card`
// (cms_components, channel 1), which the brand template (`__brand__`) repeats over its
// products. This module lifts that template's GRID — the element that repeats the
// product card over `products` — so the range page draws its tiles from the same stored
// master through the same engine (`renderBrandNodeBranch`), while keeping its own
// breadcrumb and heading.
//
// PURE: the stored tree is never mutated; a template without a recognisable grid
// returns null and the route keeps its React grid.
// ============================================================================

/** The master the grid must repeat for the lift to apply. */
const PRODUCT_CARD_KEY = "product-card";

function children(node: BuilderNode): BuilderNode[] {
  if (node.kind === "element" || node.kind === "repeat") return (node.children ?? []) as BuilderNode[];
  return [];
}

function repeatsProductCard(node: BuilderNode): boolean {
  if (node.kind !== "repeat" || node.source !== "products") return false;
  const walk = (n: BuilderNode): boolean =>
    (n.kind === "component" && n.componentKey === PRODUCT_CARD_KEY) || children(n).some(walk);
  return children(node).some(walk);
}

/**
 * The brand template's product grid as a tree of its own: the first element that
 * directly repeats the `product-card` master over `products` (depth-first, document
 * order). The grid element's own condition is dropped — the route only renders the
 * grid when it has products. `null` when the template has no such grid.
 */
export function brandTemplateProductGrid(tree: unknown): NodeTree | null {
  const root = (tree as NodeTree | null | undefined)?.root;
  if (!root) return null;
  const find = (node: BuilderNode): BuilderNode | null => {
    if (node.kind === "element" && (node.children ?? []).some((c) => repeatsProductCard(c as BuilderNode))) {
      return node;
    }
    for (const c of children(node)) {
      const hit = find(c);
      if (hit) return hit;
    }
    return null;
  };
  const grid = find(root);
  if (!grid) return null;
  const { condition: _condition, ...rest } = grid as BuilderNode & { condition?: unknown };
  return { v: 1, root: rest as BuilderNode };
}

/** The four Zoey list switches a tile reads as `context.listing.*`. */
export interface RangeListingSettings {
  add_to_cart: boolean | null;
  compare: boolean | null;
  wishlist: boolean | null;
  qty: boolean | null;
}

/**
 * The range page's Zoey list switches: the range category's own `metafields.zoey_listing`,
 * else the brand page's — KEY BY KEY, so a switch the range does not set falls through to
 * the brand's. `rangeMetafields` is null when the page is not listing the range's own
 * products (unresolved range, or a range the brand has nothing in).
 */
export function rangeListingSettings(rangeMetafields: unknown, brandMetafields: unknown): RangeListingSettings {
  const own = readListingSettings(rangeMetafields);
  const brand = readListingSettings(brandMetafields);
  return {
    add_to_cart: own.add_to_cart ?? brand.add_to_cart,
    compare: own.compare ?? brand.compare,
    wishlist: own.wishlist ?? brand.wishlist,
    qty: own.qty ?? brand.qty,
  };
}
