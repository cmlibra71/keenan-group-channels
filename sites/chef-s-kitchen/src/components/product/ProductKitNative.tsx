"use client";

// ============================================================================
// ProductKitNative — the kit block as a SEALED SITE-BUILDER LEAF.
//
// Both live storefronts render their product page from an authored node tree
// (`node_product_template_enabled`). Natives are keyed: a tree node with the key `product-kit`
// renders this, and `builder/product-kit-node.ts` PLACES that node on every product page at
// render time (card Tc5ekvD6), so no stored tree has to be re-authored.
//
// It carries state (the customer's picks), which is exactly the kind of thing this repo seals
// rather than explodes. The picks live in `KitPurchaseProvider` above the whole page, NOT here:
// the page's own Add to Cart and Add to Quote send them and the purchase provider prices them, so
// this leaf draws the pickers and nothing else — no buy button of its own (7bmpuqei: two
// identical CTAs read as a bug).
// ============================================================================

import { ProductKitBlock } from "./ProductKitBlock";
import type { ProductKit } from "@/lib/product-kit";

export function ProductKitNative({ kit }: { kit: ProductKit }) {
  return <ProductKitBlock kit={kit} />;
}
