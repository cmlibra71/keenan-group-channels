import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { numericSpecialHit, offerPriceWithSpecial, specialTagOfRow } from "./special-public-price";

const SPECIAL = { promotionId: 9, label: "Clearance", badge: "Partner Special - No further discounts", priceExTax: 1100, endsOn: "2026-10-31" };

test("specialTagOfRow reads the overlay's tag and nothing else", () => {
  assert.deepEqual(specialTagOfRow({ special: SPECIAL }), { priceExTax: 1100, endsOn: "2026-10-31" });
  assert.equal(specialTagOfRow({}), null);
  assert.equal(specialTagOfRow(null), null);
  assert.equal(specialTagOfRow({ special: { priceExTax: "x" } }), null);
  assert.equal(specialTagOfRow({ special: { priceExTax: 0 } }), null);
  assert.deepEqual(specialTagOfRow({ special: { priceExTax: 5, endsOn: "soon" } }), { priceExTax: 5, endsOn: null });
});

test("a special search hit gets numeric prices, so 999 < 1200 compares as money not text", () => {
  // The overlay writes 2dp strings: as text "999.00" < "1200.00" is FALSE and the dropdown would
  // drop the sale figure and quote the regular price.
  const hit = numericSpecialHit({ id: 1, price: "1200.00", salePrice: "999.00", special: SPECIAL });
  assert.equal(hit.price, 1200);
  assert.equal(hit.salePrice, 999);
  assert.ok((hit.salePrice as number) < (hit.price as number));
});

test("a special at or above the regular price leaves salePrice null and price the special", () => {
  const hit = numericSpecialHit({ id: 1, price: "1100.00", salePrice: null, special: SPECIAL });
  assert.equal(hit.price, 1100);
  assert.equal(hit.salePrice, null);
});

test("a hit with no special is returned by identity", () => {
  const hit = { id: 2, price: 50, salePrice: null };
  assert.equal(numericSpecialHit(hit), hit);
});

test("the JSON-LD offer states the special and its last day, whatever the page would otherwise say", () => {
  assert.deepEqual(offerPriceWithSpecial({ special: SPECIAL }, 1580), { priceEx: 1100, priceValidUntil: "2026-10-31" });
  assert.deepEqual(offerPriceWithSpecial({}, 1580), { priceEx: 1580, priceValidUntil: null });
  assert.deepEqual(offerPriceWithSpecial(undefined, 12.5), { priceEx: 12.5, priceValidUntil: null });
});

// ── Wiring (source-level: importing the route or the page would open database connections) ──

const SRC = fileURLToPath(new URL("../..", import.meta.url));

function code(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

test("/api/search lays the special over its hits AFTER the sale-price suppression", () => {
  const route = code(path.join(SRC, "app", "api", "search", "route.ts"));
  const suppress = route.indexOf("shouldSuppressCatalogSalePrice()");
  const special = route.indexOf("applySpecialPrices(");
  assert.ok(suppress > 0, "route must still suppress the catalogue sale price");
  assert.ok(special > suppress, "applySpecialPrices must run after the suppression, or it clears the special");
  assert.ok(route.indexOf("numericSpecialHit(") > special, "special hits must be turned back into numbers");
  assert.ok(route.indexOf("map(toPublicHit)") > special, "the public allowlist must still run last");
});

test("a product page that publishes a JSON-LD Offer prices it through the special", () => {
  const page = path.join(SRC, "app", "products", "[slug]", "page.tsx");
  if (!existsSync(page)) return;
  const src = code(page);
  if (!/ld\+json/.test(src)) return; // a tree whose product page publishes no structured data
  assert.match(
    src,
    /offerPriceWithSpecial|applySpecialPrices/,
    "the product page's JSON-LD must state the live Partner Special, not the price under it"
  );
});
