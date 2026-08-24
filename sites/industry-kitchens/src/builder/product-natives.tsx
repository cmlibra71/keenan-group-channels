"use client";
import type { NativeComponents } from "@keenan/services/builder-react";
import { ProductImageGallery, type ProductImage as GalleryImage } from "@/components/product/ProductImageGallery";
import { ProductKitNative } from "@/components/product/ProductKitNative";
import type { ProductKit } from "@/lib/product-kit";
import { WarrantyDirectory } from "@/components/product/WarrantyDirectory";
import { GstToggle } from "@/components/layout/GstToggle";
import { SilverChefPanel } from "@/components/product/SilverChefPanel";
import { ProductImageNotice } from "@/components/product/ProductImageNotice";
import { CdMemberPricingPanel } from "@/components/product/CdMemberPricingPanel";
import type { CdMembershipData } from "@/lib/pricing/cd-member-pricing";

// ============================================================================
// Industry Kitchens' sealed product-page leaves.
//
// The wrapper is engine; WHICH parts of a product page a site keeps as coded
// components is not. Two are left, and both are the same KIND of thing Chefs
// Depot seals — a widget with behaviour or data of its own, never a layout:
//
//   product-gallery    — zoom, pan, thumbnail rail, video slides.
//   warranty-directory — the 100-brand claims table with its search box. The
//     dataset lives inside the component; a tree can lay out a list, it cannot
//     carry the list.
//
// Everything else on this page is now authored: the buybox (price, options,
// CTAs, bulk tiers) and, as of this change, the tab strip and its panels. The
// keys those used to occupy — product-overview, product-tabs — are gone from
// here ON PURPOSE: natives win over masters by key, so leaving either behind
// would silently un-explode the section the moment someone re-published it.
//
// `data` is the route's own bag; the shapes below mirror what the legacy page
// passes to each component.
// ============================================================================

export interface ProductNativesArgs {
  payload: Record<string, unknown>;
  variantImageUrl: string | null;
  data: Record<string, unknown>;
}

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
    "warranty-directory": () => <WarrantyDirectory />,
    // Storewide ex/inc-GST switch, now that it has left the header. Sealed for
    // the same reason as the two above: it carries behaviour of its own (writes
    // the GST cookie, flips a site-wide React context). It sits in normal flow
    // with no `hidden md:` gating, so phones get it too.
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
