"use client";

// ============================================================================
// "This product can not be shipped to a residential address" — card HMtUxvwZ.
//
// Some appliances are commercial equipment the business will not send to a
// house: three-phase, hard-wired, no domestic warranty. Ticked per product in the
// portal (`products.restrict_residential_purchase`), for the reason Tim gave on
// 7vu2iEEZ: "each product gets individual controls".
//
// THE WORDING IS THE CARD'S and is reproduced verbatim from
// `@keenan/services/residential`, the same constant the portal's product screen
// describes and the checkout note is drawn from. Do not paraphrase it here.
//
// IT WARNS, IT DOES NOT REFUSE. Add to Cart and Add to Quote are untouched: the
// customer can still buy this product to a house, and the note is there so the
// desk hears about it first. That is the card's own instruction ("a message in
// red should appear") and the standing rule that details we merely want stay
// prompts, never gates. It is therefore NOT one of the three buying controls of
// 7vu2iEEZ, which hide a button — and it says nothing about stock, so it is not
// the availability wording CXnP1lrL retired either.
//
// Why a coded leaf rather than classes in the stored tree: the product page
// renders from an AUTHORED node tree, and a class used in a stored tree only
// works if it already exists in the DEPLOYED stylesheet (the tree is data; the
// builder CSS is recompiled only when a human publishes). Placement is a pure
// pass over the tree — `builder/product-residential-notice.ts`.
// ============================================================================

import { RESIDENTIAL_PRODUCT_NOTICE } from "@keenan/services/residential";

export { RESIDENTIAL_PRODUCT_NOTICE };

export function ProductResidentialNotice({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <p
      data-testid="product-residential-notice"
      className="mt-3 text-sm font-semibold leading-snug text-[#C0392B]"
    >
      {RESIDENTIAL_PRODUCT_NOTICE}
    </p>
  );
}

export default ProductResidentialNotice;
