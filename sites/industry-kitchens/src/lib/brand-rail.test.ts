import { test } from "node:test";
import assert from "node:assert/strict";
import { brandRailNextPageHref, parseBrandRailSelections } from "./brand-rail";

const all = new Set(["sub", "brand", "price"]);

test("sub, an old cat link, labels, price and the hero flag", () => {
  const s = parseBrandRailSelections({ sub: "839", cat: "1243,839", brand: "Waldorf Bold, Waldorf Bold,Waldorf", price: "lt1000", sort: "price_asc", page: "2" }, all, 0, "relevance");
  assert.deepEqual(s.categoryIds, [839, 1243]);
  assert.deepEqual(s.labels, ["Waldorf Bold", "Waldorf"]);
  assert.deepEqual(s.priceBands, ["lt1000"]);
  assert.equal(s.priceRange, undefined);
  assert.equal(s.sort, "price_asc");
  assert.equal(s.page, 2);
  assert.equal(s.filtered, true);
});

test("a price window when no band; nothing ticked is unfiltered; default sort", () => {
  const w = parseBrandRailSelections({ price: "1000-5000" }, all, 0, "price_desc");
  assert.deepEqual(w.priceBands, []);
  assert.deepEqual(w.priceRange, { min: 1000, max: 5000 });
  const none = parseBrandRailSelections({}, all, 0, "price_desc");
  assert.equal(none.filtered, false);
  assert.equal(none.sort, "price_desc");
  assert.equal(none.page, 1);
  assert.equal(parseBrandRailSelections({}, all, 1, "relevance").filtered, true); // an attribute
});

test("switched-off facets stop filtering; labels are capped", () => {
  const off = parseBrandRailSelections({ sub: "839", brand: "Waldorf Bold", price: "lt1000" }, new Set(), 0, "relevance");
  assert.deepEqual([off.categoryIds, off.labels, off.rawPrice, off.filtered], [[], [], undefined, false]);
  const many = parseBrandRailSelections({ brand: Array.from({ length: 30 }, (_, i) => `L${i}`).join(",") }, all, 0, "relevance");
  assert.equal(many.labels.length, 20);
});

test("Load more carries every selection and the next cumulative page", () => {
  const s = parseBrandRailSelections({ cat: "839", brand: "Waldorf Bold", price: "1000-5000", page: "1" }, all, 1, "relevance");
  assert.equal(
    brandRailNextPageHref({ basePath: "/brands/waldorf", selections: s, attributeParams: { f_fuel_type: "gas" }, sortParam: "price_asc" }),
    "/brands/waldorf?sub=839&brand=Waldorf+Bold&price=1000-5000&f_fuel_type=gas&sort=price_asc&page=2"
  );
});
