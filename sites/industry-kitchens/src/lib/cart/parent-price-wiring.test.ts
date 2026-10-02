import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Zoey "use child price: No" (IK batch 5, money): the cart and the quote price a chosen option from
// the PARENT, as the product page does. The pricing itself is unit-tested in services
// (resolveCatalogPrice / catalogLinePrices with { parentPrice }); this pins the wiring.
const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("the cart line price reads the storefront's use-child-price answer", () => {
  const src = read("../actions/cart.ts");
  assert.match(src, /usesParentPrice\(product\.metafields, CHANNEL_ID\)/);
  assert.match(src, /catalogLinePrices\(product, variant, \{ parentPrice: parentPriced \}\)/);
});

test("the quote line skips the variant's own price when the parent prices it", () => {
  const src = read("../actions/quote.ts");
  assert.match(src, /usesParentPrice\(\(product as \{ metafields\?: unknown \}\)\.metafields, CHANNEL_ID\)/);
  assert.match(src, /if \(variantId && !parentPriced\)/);
});
