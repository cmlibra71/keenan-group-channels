"use client";

// ============================================================================
// ProductKitNative — the kit block as a SEALED SITE-BUILDER LEAF.
//
// Both live storefronts render their product page from an authored node tree
// (`node_product_template_enabled`), so the kit block cannot reach them by being added to the
// legacy buy box alone. Natives are keyed: a tree node with the key `product-kit` renders this,
// and `builder/product-kit-node.ts` puts that node above the buy box at render time so a kit is
// complete on the live page without waiting on an authoring step. An author who places the node
// themselves in the Site Builder gets their own placement instead.
//
// It carries state (the customer's picks), which is exactly the kind of thing this repo seals
// rather than explodes — same reason the gallery and the GST toggle are sealed. The picks live one
// level up, in KitSelectionContext, so THE PAGE'S OWN Add to Quote sends them: the block
// deliberately adds no button of its own, or a bundle would show two identical CTAs.
// ============================================================================

import { ProductKitBlock } from "./ProductKitBlock";
import { useKitSelection } from "./KitSelectionContext";
import type { ProductKit } from "@/lib/product-kit";

export function ProductKitNative({ kit }: { kit: ProductKit; productId?: number }) {
  const { selection, select } = useKitSelection();
  return <ProductKitBlock kit={kit} selection={selection} onSelect={select} />;
}
