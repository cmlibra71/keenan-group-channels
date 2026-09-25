// ============================================================================
// Drift guard: the Chefs Depot FALLBACK product-page renderers count what the node tree counts.
//
// The live product page is the authored node tree, whose quantity text binds the bridge's
// `purchase.quantity` — the PACKAGE count where Zoey's Enable Packaging is on ("2" beside
// "2 Cartons = 4 Pcs", card O108e4jH). Two other renderers serve the moment staff flip a design
// switch: the legacy `ProductDetail` buy panel and the v2 blocks `QuantityWidget`. Both once showed
// the PIECE count beside the same carton sentence ("4" next to "2 Cartons = 4 Pcs"), which is the
// renderer disagreement `sf-product-page` ("They agree about the SELLING UNIT too") forbids.
//
// Read as SOURCE: both files pull in React, `next/*` and the store, none of which belong in a unit
// test. The behaviour itself (boxQuantity / stepPackQuantity) is tested in @keenan/services.
// ============================================================================
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { boxQuantity, stepPackQuantity } from "@keenan/services/pack";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RENDERERS = {
  ProductDetail: path.join(HERE, "ProductDetail.tsx"),
  QuantityWidget: path.join(HERE, "..", "..", "blocks", "widgets-client.tsx"),
};

/** The JSX of the quantity box: from "Decrease quantity" to "Increase quantity". */
function quantityBox(file: string): string {
  const src = fs.readFileSync(file, "utf8");
  const start = src.indexOf('aria-label="Decrease quantity"');
  const end = src.indexOf('aria-label="Increase quantity"', start);
  assert.ok(start > 0 && end > start, `${path.basename(file)} still has a +/- quantity box`);
  // Include the onClick of the − button, which sits just before its aria-label.
  return src.slice(src.lastIndexOf("<button", start), end);
}

for (const [name, file] of Object.entries(RENDERERS)) {
  test(`${name}: the box shows boxQuantity (cartons where Enable Packaging is on), never pieces`, () => {
    const box = quantityBox(file);
    assert.match(box, /\{boxQuantity\}/);
    assert.doesNotMatch(box, /\{quantity\}/);
  });

  test(`${name}: +/- step one pack on the piece quantity, exactly as the bridge does`, () => {
    const src = fs.readFileSync(file, "utf8");
    assert.match(src, /setQuantity\(stepPackQuantity\(quantity, packSize, -1\)\)/);
    assert.match(src, /setQuantity\(stepPackQuantity\(quantity, packSize, 1\)\)/);
  });
}

test("the step the renderers use moves the box by exactly one carton and floors at one", () => {
  // Carton of 2, Enable Packaging on: the box reads 1 → 2 → 3 → 2 → 1 → 1.
  let pieces = 2;
  const seen = [boxQuantity(pieces, 2, true)];
  for (const dir of [1, 1, -1, -1, -1] as const) {
    pieces = stepPackQuantity(pieces, 2, dir);
    seen.push(boxQuantity(pieces, 2, true));
  }
  assert.deepEqual(seen, [1, 2, 3, 2, 1, 1]);
  // Enable Packaging off ("Sold in multiples of 12"): the box counts pieces, a pack at a time.
  assert.equal(boxQuantity(stepPackQuantity(12, 12, 1), 12, false), 24);
  // Sold individually: unchanged one-at-a-time control.
  assert.equal(boxQuantity(stepPackQuantity(3, 1, 1), 1, false), 4);
});
