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

import { useEffect, useState } from "react";
import { useBuilderLocalState } from "@keenan/services/builder-react";
import { BUNDLE_CONFIGURED_STATE, bundleAmount } from "@keenan/services/zoey-bundle-price";
import { useGst } from "@/lib/gst";
import { ProductKitBlock } from "./ProductKitBlock";
import { AddToQuoteButton } from "./AddToQuoteButton";
import {
  defaultKitSelection,
  kitConfiguredPrice,
  kitSelectionReady,
  toKitChoices,
  toggleKitSelection,
  type KitSelection,
  type ProductKit,
} from "@/lib/product-kit";

export function ProductKitNative({ kit, productId }: { kit: ProductKit; productId: number }) {
  const [selection, setSelection] = useState<KitSelection>(() =>
    kit.kind === "bundle" ? defaultKitSelection(kit.groups) : {}
  );
  const isBundle = kit.kind === "bundle";
  const ready = kitSelectionReady(kit, selection);
  const { inclusive } = useGst();

  // Zoey's "Price as configured" follows the picks. The page template prints it from
  // `@state.bundle_configured_display` (falling back to `purchase.bundleConfiguredDisplay`, the
  // unpicked value), so the words and where they sit stay the template's; this only keeps the
  // amount current. A bare number like every `*Display` field. Nothing is written without a
  // captured Zoey range.
  const local = useBuilderLocalState();
  const configured = kitConfiguredPrice(kit, selection);
  const configuredDisplay =
    configured == null
      ? ""
      : bundleAmount(configured, inclusive).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  useEffect(() => {
    if (configuredDisplay) local?.setValue(BUNDLE_CONFIGURED_STATE, configuredDisplay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configuredDisplay]);

  return (
    <div>
      <ProductKitBlock
        kit={kit}
        selection={selection}
        onSelect={(group, id) => setSelection((prev) => toggleKitSelection(kit, prev, group, id))}
        inclusive={inclusive}
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
