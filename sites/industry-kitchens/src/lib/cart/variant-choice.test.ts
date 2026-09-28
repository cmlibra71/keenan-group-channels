import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogLinePrices } from "@keenan/services/catalog-price";
import {
  NO_VARIANT_CHOICES,
  catalogPricingVariantId,
  isPickMode,
  unchosenOptionsRefusal,
  type VariantChoiceFacts,
} from "./variant-choice.ts";

// DB rows as measured 2026-09-28 (IK judge wave 1).
const seattle: VariantChoiceFacts = { optionLabels: ["Castors", "Colour"], choiceVariantIds: new Set([810, 812]) };
const robotCoupe: VariantChoiceFacts = { optionLabels: [], choiceVariantIds: new Set() }; // 219986, one unmapped variant

test("pick mode needs options AND mapped variants, as the page's useGroupedMode does", () => {
  assert.equal(isPickMode(seattle), true);
  assert.equal(isPickMode(robotCoupe), false);
  assert.equal(isPickMode(NO_VARIANT_CHOICES), false);
  assert.equal(isPickMode({ optionLabels: ["Size"], choiceVariantIds: new Set() }), false);
  assert.equal(isPickMode({ optionLabels: [], choiceVariantIds: new Set([1]) }), false);
  assert.equal(isPickMode(null), false);
});

test("a simple product's lone base variant is priced as the parent, sale included (Robot Coupe 27382, Baron Q70NEC/410)", () => {
  // Robot Coupe: parent 1050 / sale 966, base variant 1293744 at 1050 with no sale.
  assert.equal(catalogPricingVariantId(robotCoupe, 1293744), null);
  const parent = { price: "1050.0000", sale_price: "966.0000" };
  const baseVariant = { price: "1050.0000", sale_price: null };
  // Before: the named variant priced the line from its own row — $1,050.
  assert.deepEqual(catalogLinePrices(parent, baseVariant), { listPrice: "1050", salePrice: null });
  // After: no variant reaches the resolver — the page's $966.
  assert.deepEqual(catalogLinePrices(parent, null), { listPrice: "1050", salePrice: "966" });

  // Baron: parent 2540 / sale 1899, base variant 78076 at 2510 → the page's 2540 struck, 1899 charged.
  assert.equal(catalogPricingVariantId(robotCoupe, 78076), null);
  assert.deepEqual(catalogLinePrices({ price: "2540.0000", sale_price: "1899.0000" }, null), {
    listPrice: "2540",
    salePrice: "1899",
  });
});

test("a chosen variation of a configurable is still priced from its own row", () => {
  assert.equal(catalogPricingVariantId(seattle, 810), 810);
  assert.equal(catalogPricingVariantId(seattle, 812), 812);
  // Seattle Yes/Black: variant 565, parent sale 408.18 is NOT borrowed (the variant has its own price).
  assert.deepEqual(catalogLinePrices({ price: "54", sale_price: "408.18" }, { price: "565", sale_price: null }), {
    listPrice: "565",
    salePrice: null,
  });
  // No variant named: nothing to price from but the parent.
  assert.equal(catalogPricingVariantId(seattle, null), null);
  assert.equal(catalogPricingVariantId(seattle, undefined), null);
  // A failed facts read (null) is handled by the caller; the pure rule says "not a choice".
  assert.equal(catalogPricingVariantId(null, 810), null);
});

test("a configurable with no variation chosen is refused with the page's sentence (Durafurn Seattle)", () => {
  assert.deepEqual(unchosenOptionsRefusal(seattle, null, { posted: true }), {
    error: "Please choose Castors and Colour before adding this to your cart.",
  });
  // A variant that is not one of the product's choices is refused the same way.
  assert.deepEqual(unchosenOptionsRefusal(seattle, 999999, { posted: true }), {
    error: "Please choose Castors and Colour before adding this to your cart.",
  });
  // A listing tile posts no configuration: the refusal names, and carries, the product page.
  assert.deepEqual(
    unchosenOptionsRefusal(seattle, null, {
      posted: false,
      productPage: "/products/durafurn-seattle-twin-folding-table-base",
    }),
    {
      error: "Open this product's page to choose Castors and Colour before adding it to your cart.",
      productPage: "/products/durafurn-seattle-twin-folding-table-base",
    }
  );
  assert.deepEqual(unchosenOptionsRefusal(seattle, undefined, { posted: false }), {
    error: "Open this product's page to choose Castors and Colour before adding it to your cart.",
  });
  // One option: no "and".
  assert.deepEqual(
    unchosenOptionsRefusal({ optionLabels: ["Size"], choiceVariantIds: new Set([2272, 2273]) }, null, { posted: true }),
    { error: "Please choose Size before adding this to your cart." }
  );
});

test("a chosen variation, a simple product, or an unknown shape is never refused", () => {
  assert.equal(unchosenOptionsRefusal(seattle, 810, { posted: true }), null);
  assert.equal(unchosenOptionsRefusal(seattle, 812, { posted: false }), null);
  assert.equal(unchosenOptionsRefusal(robotCoupe, null, { posted: false }), null);
  assert.equal(unchosenOptionsRefusal(robotCoupe, 1293744, { posted: true }), null);
  assert.equal(unchosenOptionsRefusal(null, null, { posted: true }), null);
});
