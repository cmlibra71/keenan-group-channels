import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_LISTING_SORT_SETTING_KEY,
  FALLBACK_LISTING_SORT,
  LISTING_SORTS,
  LISTING_SORT_LABELS,
  isListingSort,
  normalizeDefaultListingSort,
  parseListingSort,
  sortParamFor,
} from "./listing-sort";

test("the setting key and the shipped order are the ones the portal writes", () => {
  assert.equal(DEFAULT_LISTING_SORT_SETTING_KEY, "default_listing_sort");
  assert.equal(FALLBACK_LISTING_SORT, "relevance");
});

test("every order has shopper-facing wording", () => {
  for (const sort of LISTING_SORTS) {
    assert.equal(typeof LISTING_SORT_LABELS[sort], "string");
    assert.ok(LISTING_SORT_LABELS[sort].length > 0);
  }
});

test("only the known tokens are orders", () => {
  assert.equal(isListingSort("price_desc"), true);
  assert.equal(isListingSort("price"), false);
  assert.equal(isListingSort(undefined), false);
  assert.equal(isListingSort(null), false);
  assert.equal(isListingSort(7), false);
});

test("a storefront that has never configured anything keeps the shipped order", () => {
  assert.equal(normalizeDefaultListingSort(undefined), "relevance");
  assert.equal(normalizeDefaultListingSort(null), "relevance");
  assert.equal(normalizeDefaultListingSort(""), "relevance");
});

test("an order a newer portal knows about and this build does not is not trusted", () => {
  assert.equal(normalizeDefaultListingSort("stock_level"), "relevance");
});

test("the setting is read as a bare string or wrapped in an object", () => {
  assert.equal(normalizeDefaultListingSort("price_desc"), "price_desc");
  assert.equal(normalizeDefaultListingSort({ sort: "price_asc" }), "price_asc");
});

test("?sort= wins over the storefront default", () => {
  assert.equal(parseListingSort("price_asc", "price_desc"), "price_asc");
  assert.equal(parseListingSort("newest", "price_desc"), "newest");
});

test("?sort=relevance is honoured, so the first option stays reachable on a price-ordered site", () => {
  assert.equal(parseListingSort("relevance", "price_desc"), "relevance");
});

test("a missing or junk ?sort= takes the storefront default", () => {
  assert.equal(parseListingSort(undefined, "price_desc"), "price_desc");
  assert.equal(parseListingSort("", "price_desc"), "price_desc");
  assert.equal(parseListingSort("cheapest", "price_desc"), "price_desc");
});

test("with no default configured a missing ?sort= is still relevance", () => {
  assert.equal(parseListingSort(undefined), "relevance");
});

test("the control writes no parameter for the storefront's OWN default", () => {
  assert.equal(sortParamFor("price_desc", "price_desc"), null);
  assert.equal(sortParamFor("relevance", "relevance"), null);
});

test("on a price-ordered storefront, choosing Relevance writes the parameter", () => {
  // Dropping it would send the shopper straight back to price high-to-low and
  // the control would read as broken.
  assert.equal(sortParamFor("relevance", "price_desc"), "relevance");
});

test("an unrecognised choice falls back to the default and so writes nothing", () => {
  assert.equal(sortParamFor("nonsense", "price_desc"), null);
});
