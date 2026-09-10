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
import { ProductResidentialNotice } from "@/components/product/ProductResidentialNotice";
import { ProductPackNote } from "@/components/product/ProductPackNote";
import { MODULAR_NOTICE_TEXT, slugIsModularSystems } from "@/builder/modular-notice";
import { CdMemberPricingPanel } from "@/components/product/CdMemberPricingPanel";
import type { CdMembershipData } from "@/lib/pricing/cd-member-pricing";
import { ProductAddons } from "@/components/product/ProductAddons";

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
    // Paid add-on extras (card 0CDcCYmO). Sealed because the shopper's picks ARE live
    // purchase state — they move the headline price, the weekly finance figure and what
    // Add to Cart sends — and an authored tree can hold neither state nor money. Renders
    // nothing for a product with no extras, so the node is safe on every product page.
    "product-addons": () => <ProductAddons />,
    // "Images are for illustrative purposes only" (card 82HgV23q). Sealed rather than
    // authored because the supplied panel colour is not a token on either site, and a
    // colour class invented in a STORED tree has no rule in the deployed stylesheet.
    // Renders null unless this product carries the tick.
    "product-image-notice": () => (
      <ProductImageNotice show={product.imageIsIllustrative === true} />
    ),
    // "This product can not be shipped to a residential address" (card HMtUxvwZ). Sealed
    // for the same reason as the banner above: the line has to be able to appear on any
    // product on either site, and both sites render this page from a stored tree. It
    // WARNS ONLY — Add to Cart and Add to Quote are untouched. Renders null unless this
    // product carries the tick.
    "product-residential-notice": () => (
      <ProductResidentialNotice show={product.restrictResidentialPurchase === true} />
    ),
    // "Carton contains 12 Pcs" (cards O108e4jH / zeMPVcA3). Sealed rather than exploded: it
    // multiplies the price the shopper is being shown by the pack size, which is live purchase
    // state a stored tree cannot carry, and it renders NULL on every product sold individually.
    "product-pack-note": () => <ProductPackNote />,
    // The Modular Systems banner (card qGfWAzQx, Steve — CE-40). The SAME sealed
    // panel as the notice above, because it is the same message: one look, one
    // colour, red panel with white writing. What differs is the rule — the slug
    // instead of the per-product tick — and the wording Steve supplied on the
    // card. Suppressed when the tick has already put the panel on this page, so
    // a product can never carry the banner twice.
    "product-modular-notice": () => (
      <ProductImageNotice
        show={product.imageIsIllustrative !== true && slugIsModularSystems(product.slug)}
        text={MODULAR_NOTICE_TEXT}
        className="my-4 w-full"
      />
    ),
  };
}
