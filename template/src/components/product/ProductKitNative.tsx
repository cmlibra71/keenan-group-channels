"use client";

// ============================================================================
// ProductKitNative — the kit block as a SEALED SITE-BUILDER LEAF.
//
// Both live storefronts render their product page from an authored node tree
// (`node_product_template_enabled`), so the kit block cannot reach them by being added to the
// legacy buy box alone. Natives are keyed: a tree node with the key `product-kit` renders this.
// Registering the key here is the whole code side of it — placing the node in the authored buy box
// is then a pure authoring step in the Site Builder, with no deploy.
//
// It carries state (the customer's picks) and an action (Add to Quote with those picks), which is
// exactly the kind of thing this repo seals rather than explodes — same reason the gallery and the
// GST toggle are sealed.
// ============================================================================

import { useState } from "react";
import { ProductKitBlock } from "./ProductKitBlock";
import { AddToQuoteButton } from "./AddToQuoteButton";
import { defaultKitSelection, toKitChoices, type ProductKit } from "@/lib/product-kit";

export function ProductKitNative({ kit, productId }: { kit: ProductKit; productId: number }) {
  const [selection, setSelection] = useState<Record<string, number>>(() =>
    kit.kind === "bundle" ? defaultKitSelection(kit.groups) : {}
  );
  const isBundle = kit.kind === "bundle";
  const ready = !isBundle || kit.groups.every((g) => selection[g.name] != null);

  return (
    <div>
      <ProductKitBlock
        kit={kit}
        selection={selection}
        onSelect={(group, id) => setSelection((prev) => ({ ...prev, [group]: id }))}
      />
      {/* A bundle's own CTA travels with its picks. A grouped kit is bought with the page's
          ordinary buttons — it is one product at one price — so it gets none here. */}
      {isBundle && (
        <div className="mt-4">
          <AddToQuoteButton
            productId={productId}
            disabled={!ready}
            kitChoices={toKitChoices(selection)}
            label="Add to Quote — request pricing"
          />
        </div>
      )}
    </div>
  );
}
