import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_STOREFRONT_FILTERS,
  applyStorefrontFilters,
  enabledFilterIds,
  normalizeStorefrontFilters,
  type StorefrontFacets,
} from "./storefront-filters";

const facets = (): StorefrontFacets => ({
  subcategories: [{ id: 1, name: "Combi Ovens", slug: "combi-ovens", count: 4 }],
  brands: [{ id: 7, name: "Rational", count: 3 }],
  price: [{ key: "lt1000", count: 2 }],
  availability: [{ key: "in_stock", count: 9 }],
});

test("nothing saved = the rail's previous behaviour", () => {
  assert.deepEqual(normalizeStorefrontFilters(undefined), DEFAULT_STOREFRONT_FILTERS);
  assert.deepEqual(normalizeStorefrontFilters({}), DEFAULT_STOREFRONT_FILTERS);
});

test("reads the portal's stored shape: order, headings, enabled, collapsed", () => {
  const out = normalizeStorefrontFilters({
    filters: [
      { id: "brand", label: "Manufacturer", enabled: true, collapsed: true, sortOrder: 0 },
      { id: "price", label: "Price (ex GST)", enabled: false, collapsed: false, sortOrder: 1 },
      { id: "sub", label: "Type", enabled: true, collapsed: false, sortOrder: 2 },
    ],
  });
  assert.deepEqual(
    out.map((f) => f.id),
    ["brand", "price", "sub"]
  );
  assert.equal(out[0].label, "Manufacturer");
  assert.equal(out[0].collapsed, true);
  assert.equal(out[1].enabled, false);
  assert.equal(out[2].label, "Type");
});

test("unknown ids (the retired mock filters) are dropped, all three always returned", () => {
  const out = normalizeStorefrontFilters({
    filters: [
      { id: "rating", label: "Customer Rating", enabled: true, sortOrder: 0 },
      { id: "availability", label: "In Stock", enabled: true, sortOrder: 1 },
      { id: "brand", label: "Brand", enabled: true, sortOrder: 2 },
    ],
  });
  assert.deepEqual(
    out.map((f) => f.id),
    ["brand", "sub", "price"]
  );
});

test("enabledFilterIds reports only the switched-on facets", () => {
  const config = normalizeStorefrontFilters({
    filters: [
      { id: "sub", label: "Sub-category", enabled: true, collapsed: false, sortOrder: 0 },
      { id: "brand", label: "Brand", enabled: false, collapsed: false, sortOrder: 1 },
      { id: "price", label: "Price (ex GST)", enabled: true, collapsed: false, sortOrder: 2 },
    ],
  });
  assert.deepEqual([...enabledFilterIds(config)].sort(), ["price", "sub"]);
});

test("applyStorefrontFilters empties a switched-off facet and carries the config", () => {
  const config = normalizeStorefrontFilters({
    filters: [
      { id: "sub", label: "Sub-category", enabled: true, collapsed: false, sortOrder: 0 },
      { id: "brand", label: "Brand", enabled: false, collapsed: false, sortOrder: 1 },
      { id: "price", label: "Price (ex GST)", enabled: true, collapsed: true, sortOrder: 2 },
    ],
  });
  const out = applyStorefrontFilters(facets(), config);
  assert.equal(out.brands.length, 0, "a switched-off facet offers no options anywhere");
  assert.equal(out.subcategories.length, 1);
  assert.equal(out.price.length, 1);
  assert.deepEqual(out.filters, config);
  // Availability is untouched by this feature — it is retired at render time.
  assert.equal(out.availability.length, 1);
});

test("applyStorefrontFilters with the defaults changes nothing but the config", () => {
  const before = facets();
  const out = applyStorefrontFilters(before, DEFAULT_STOREFRONT_FILTERS);
  assert.deepEqual(out.subcategories, before.subcategories);
  assert.deepEqual(out.brands, before.brands);
  assert.deepEqual(out.price, before.price);
  assert.deepEqual(out.filters, DEFAULT_STOREFRONT_FILTERS);
});
