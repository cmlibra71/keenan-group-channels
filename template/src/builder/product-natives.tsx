"use client";
import type { NativeComponents } from "@keenan/services/builder-react";

// ============================================================================
// Sealed product-page leaves, per site.
//
// The wrapper is engine; WHICH parts of a product page a site keeps as coded
// components is not. Chefs Depot seals only the gallery — its buybox, actions
// row and tabs are exploded masters. Industry Kitchens seals the purchase panel
// and the tab strip too, because both carry real interactive state (variant
// selection, review submission) that has not been exploded yet.
//
// `data` is the route's own bag, opaque to the engine.
// ============================================================================

export interface ProductNativesArgs {
  payload: Record<string, unknown>;
  variantImageUrl: string | null;
  data: Record<string, unknown>;
}

import { ProductImageGallery, type ProductImage as GalleryImage } from "@/components/product/ProductImageGallery";
import { ProductKitNative } from "@/components/product/ProductKitNative";
import type { ProductKit } from "@/lib/product-kit";
import { GstToggle } from "@/components/layout/GstToggle";
import { SilverChefPanel } from "@/components/product/SilverChefPanel";
import { ProductImageNotice } from "@/components/product/ProductImageNotice";
import { ProductInstructionsPanel } from "@/components/product/ProductInstructionsPanel";
import { useProductPurchase } from "@keenan/services/product-page";
import { CdMemberPricingPanel } from "@/components/product/CdMemberPricingPanel";
import type { CdMembershipData } from "@/lib/pricing/cd-member-pricing";

export function productNatives({ payload, variantImageUrl, data }: ProductNativesArgs): NativeComponents {
  const product = (payload.product ?? {}) as Record<string, unknown>;
  return {
    "product-gallery": () => (
      <ProductImageGallery
        images={product.images as unknown as GalleryImage[]}
        productName={String(product.name ?? "")}
        variantImageUrl={variantImageUrl}
        videos={(product.videos ?? []) as never}
      />
    ),
    // Storewide ex/inc-GST switch — it lives beside the price now, not in the
    // header. Sealed because it writes the GST cookie and flips a site-wide
    // React context. Normal flow, no breakpoint gating: phones get it too.
    "gst-toggle": () => <GstToggle className="mt-3" />,
    // Grouped / bundle contents (card 7bmpuqei). Sealed, not exploded: it holds the customer's
    // picks and sends them through with Add to Quote. Renders nothing for a product that is not a
    // kit, so the node is safe to leave in the template for every product.
    "product-kit": () => {
      // `data.kit` is ALREADY parsed: the product route parses metafields exactly
      // once (`nativeData: { kit: readProductKit(product.metafields) }`) — the
      // same way every other native receives its data. Re-parsing a ProductKit as
      // if it were metafields found no `.kit.items` and returned null, so kit
      // contents never rendered (release-review blocker).
      const kit = (data.kit ?? null) as ProductKit | null;
      if (!kit) return null;
      return <ProductKitNative kit={kit} productId={Number(product.id)} />;
    },
    // SilverChef / Skope Funding weekly rental panel (card 6f47rFeT). Sealed
    // because the figure follows the LIVE purchase state — variant choice,
    // member/contract price — and an authored tree cannot call the finance
    // calculator. It renders nothing for a product with no price.
    "silverchef-panel": () => <SilverChefPanel />,
    // The free-text customisation groups — the "Instructions" box on Custom Stainless
    // Steel (card kyMjCmAw). SEALED for the same reason the kit block is: it holds the
    // customer's answer and that answer has to travel with whichever buy button is
    // pressed, which an authored tree cannot do. It renders nothing for a product with
    // no text groups, so the node is safe in front of every product page.
    "product-instructions": () => <ProductInstructionsNative />,
    // "Images are for illustrative purposes only" (card 82HgV23q). Sealed rather than
    // authored because the supplied panel colour is not a token on either site, and a
    // colour class invented in a STORED tree has no rule in the deployed stylesheet.
    // Renders null unless this product carries the tick.
    // Chefs Depot's three prices (RRP / Mates Rates / this shopper's member price)
    // and the spend-more-save-more ladder (card Nyp8bkPm). Sealed rather than
    // authored because the figures follow the LIVE purchase state — which variant
    // is selected, whether this product's price is hidden — and an authored tree
    // cannot call a pricing engine. `data.cdMembership` is built ONCE per request
    // by the product branch; the native never fetches. Renders null on a channel
    // that does not run the membership model, so Industry Kitchens is untouched.
    "cd-member-pricing": () => (
      <CdMemberPricingPanel data={(data.cdMembership ?? null) as CdMembershipData | null} />
    ),
    "product-image-notice": () => (
      <ProductImageNotice show={product.imageIsIllustrative === true} />
    ),
  };
}

/**
 * The panel bound to the SHARED purchase provider.
 *
 * The typed answer lives in `selectedAddons` beside the ticked extras, which is
 * what makes it travel with Add to Cart AND Add to Quote without either button
 * knowing it exists (register rule 7bmpuqei, `sf-product-page`).
 *
 * `missingLabels` is the provider's own list of required groups still unanswered,
 * shown only once the shopper has pressed a buy button — the bridge raises the
 * prompt and this marks the field that is waiting, so the refusal is never a
 * greyed control with nothing beside it.
 */
function ProductInstructionsNative() {
  const purchase = useProductPurchase();
  const groups = purchase.product.addons?.groups ?? [];
  return (
    <ProductInstructionsPanel
      groups={groups}
      values={purchase.addonText}
      onChange={purchase.setAddonText}
      // No inline error on this renderer: the node-tree page answers a press on an
      // unanswered required group with the shared "Choose an option" dialog, which
      // NAMES the field. Two refusals for one press would be one too many; the
      // field's own asterisk and "Required" line explain it before the press.
      missingLabels={[]}
    />
  );
}
