"use client";

// ============================================================================
// "Images are for illustrative purposes only" — card 82HgV23q (Tim, 2026-08-17).
//
// Some products carry a stand-in photo (a representative model, a different
// bench length, the wrong handing), and the customer has to be told to read the
// spec sheet rather than the picture. Ticked per product in the portal
// (`products.image_is_illustrative`), for the reason Tim gave on 7vu2iEEZ:
// "each product gets individual controls".
//
// THE WORDING AND THE PANEL ARE SUPPLIED by the card's design attachment and are
// reproduced verbatim, en dash included. Do not paraphrase and do not "tidy" the
// dash to a hyphen — this is customer-visible copy a stakeholder wrote.
//
// It says nothing about stock or availability, so it is NOT the storefront stock
// wording Steve retired on CXnP1lrL (catalogue.md `sf-product-page`).
//
// Why a coded leaf rather than classes in the stored tree: the product page
// renders from an AUTHORED node tree, and a class used in a stored tree only
// works if it already exists in the DEPLOYED stylesheet (the tree is data; the
// builder CSS is recompiled only when a human publishes). The panel colour is
// the design's exact terracotta, which is not a token on either site, so the
// styling lives here in source where Tailwind compiles it with the build and it
// cannot render unstyled. Placement is still a pure pass over the tree —
// `builder/product-image-notice.ts`.
// ============================================================================

/** The exact copy from the card's design. The dash is an EN DASH (U+2013). */
export const IMAGE_NOTICE_TEXT =
  "IMAGES ARE FOR ILLUSTRATIVE PURPOSES ONLY – REFER TO SPEC SHEET";

/** The design's terracotta. Not a site token: the same panel on both storefronts. */
export const IMAGE_NOTICE_BG = "#C85735";

export function ProductImageNotice({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="mb-6 w-full">
      <div
        className="w-full rounded-lg px-6 py-4 text-center"
        style={{ backgroundColor: IMAGE_NOTICE_BG }}
      >
        <p className="text-base font-bold uppercase leading-snug tracking-wide text-white sm:text-lg">
          {IMAGE_NOTICE_TEXT}
        </p>
      </div>
    </div>
  );
}

export default ProductImageNotice;
