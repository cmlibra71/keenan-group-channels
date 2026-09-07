import test from "node:test";
import assert from "node:assert/strict";
import {
  CATEGORY_PARAM,
  MAX_PAGES,
  attributeParamsOf,
  brandClearParams,
  brandFacetGroups,
  brandNextPageHref,
  parseBrandPage,
  parseBrandSort,
  parseIds,
  railCategoryOptions,
  MAX_CATEGORY_IDS,
  RAIL_CATEGORY_LIMIT,
  type BrandListingFacets,
} from "./brand-listing";
import { DEFAULT_STOREFRONT_FILTERS, type StorefrontFilter } from "./storefront-filters";

const facets = (): BrandListingFacets => ({
  categories: [
    { id: 11, name: "Combi Ovens", slug: "combi-ovens", count: 12 },
    { id: 12, name: "Ovens", slug: "ovens", count: 4 },
  ],
  price: [
    { key: "lt1000", count: 2 },
    { key: "1000to3000", count: 5 },
    { key: "gt3000", count: 9 },
  ],
  priceRange: { min: 170, max: 59040 },
  attributes: [
    {
      code: "doors",
      label: "Doors",
      kind: "options",
      options: [{ value: "2-door", label: "2 Door", count: 6 }],
    },
  ],
});

const off = (id: StorefrontFilter["id"]): StorefrontFilter[] =>
  DEFAULT_STOREFRONT_FILTERS.map((f) => (f.id === id ? { ...f, enabled: false } : f));

test("the rail is Category, Price and the attribute sections — never Brand", () => {
  const groups = brandFacetGroups(facets(), DEFAULT_STOREFRONT_FILTERS);
  assert.deepEqual(
    groups.map((g) => g.param),
    [CATEGORY_PARAM, "price", "f_doors"]
  );
  assert.equal(groups[0].title, "Category");
  assert.equal(
    groups.some((g) => g.param === "brand"),
    false
  );
});

test("the Category group carries the brand's categories with their counts", () => {
  const [category] = brandFacetGroups(facets(), DEFAULT_STOREFRONT_FILTERS);
  assert.deepEqual(category.options, [
    { value: "11", label: "Combi Ovens", count: 12 },
    { value: "12", label: "Ovens", count: 4 },
  ]);
});

test("Price renders as the slider when the listing knows its travel", () => {
  const price = brandFacetGroups(facets(), DEFAULT_STOREFRONT_FILTERS).find(
    (g) => g.param === "price"
  )!;
  assert.deepEqual(price.range, { min: 170, max: 59040, money: true });
  // The three legacy band tokens keep their labels so a bookmarked ?price=
  // still names itself in the chips.
  assert.deepEqual(
    price.options.map((o) => o.label),
    ["Under $1,000", "$1,000–$3,000", "$3,000+"]
  );
});

test("a switched-off facet leaves the rail AND leaves Clear all", () => {
  const withoutCategory = brandFacetGroups(facets(), off("sub"));
  assert.deepEqual(
    withoutCategory.map((g) => g.param),
    ["price", "f_doors"]
  );
  assert.deepEqual(brandClearParams(facets(), off("sub")), ["price", "f_doors"]);

  const withoutPrice = brandFacetGroups(facets(), off("price"));
  assert.deepEqual(
    withoutPrice.map((g) => g.param),
    [CATEGORY_PARAM, "f_doors"]
  );
  assert.deepEqual(brandClearParams(facets(), off("price")), [CATEGORY_PARAM, "f_doors"]);
});

test("the rail follows the channel's configured order and open state", () => {
  const reordered: StorefrontFilter[] = [
    { id: "price", label: "Budget", enabled: true, collapsed: true, sortOrder: 0 },
    { id: "brand", label: "Brand", enabled: true, collapsed: false, sortOrder: 1 },
    { id: "sub", label: "Sub-category", enabled: true, collapsed: false, sortOrder: 2 },
  ];
  const groups = brandFacetGroups(facets(), reordered);
  assert.deepEqual(
    groups.map((g) => g.param),
    ["price", CATEGORY_PARAM, "f_doors"]
  );
  assert.equal(groups[0].title, "Budget");
  assert.equal(groups[0].defaultOpen, false);
  // The heading is the brand page's own: there are no sub-categories here to name.
  assert.equal(groups[1].title, "Category");
});

test("a brand with no categories simply has no Category section", () => {
  const groups = brandFacetGroups({ ...facets(), categories: [] }, DEFAULT_STOREFRONT_FILTERS);
  assert.equal(
    groups.some((g) => g.param === CATEGORY_PARAM),
    false
  );
});

test("Load more carries the live filters, drops the switched-off ones, advances the page", () => {
  const sp = { cat: "11,12", price: "1000-3000", f_doors: "2-door", sort: "price_asc", page: "2" };
  const href = brandNextPageHref({
    slug: "rational",
    searchParams: sp,
    page: 2,
    categoryEnabled: true,
    priceEnabled: true,
    attributeParams: attributeParamsOf(facets()),
  });
  const url = new URL(href, "https://example.test");
  assert.equal(url.pathname, "/brands/rational");
  assert.equal(url.searchParams.get("cat"), "11,12");
  assert.equal(url.searchParams.get("price"), "1000-3000");
  assert.equal(url.searchParams.get("f_doors"), "2-door");
  assert.equal(url.searchParams.get("sort"), "price_asc");
  assert.equal(url.searchParams.get("page"), "3");

  const noPrice = new URL(
    brandNextPageHref({
      slug: "rational",
      searchParams: sp,
      page: 2,
      categoryEnabled: false,
      priceEnabled: false,
      attributeParams: attributeParamsOf(facets()),
    }),
    "https://example.test"
  );
  assert.equal(noPrice.searchParams.get("cat"), null);
  assert.equal(noPrice.searchParams.get("price"), null);
});

test("page and sort are clamped, so a hand-typed URL cannot ask for everything", () => {
  assert.equal(parseBrandPage(undefined), 1);
  assert.equal(parseBrandPage("0"), 1);
  assert.equal(parseBrandPage("nonsense"), 1);
  assert.equal(parseBrandPage("999"), MAX_PAGES);
  assert.equal(parseBrandSort(undefined), "relevance");
  assert.equal(parseBrandSort("drop table"), "relevance");
  assert.equal(parseBrandSort("price_desc"), "price_desc");
});

test("category ids are integers or they are not ids", () => {
  assert.deepEqual(parseIds("11,12"), [11, 12]);
  assert.deepEqual(parseIds("11,abc,,13"), [11, 13]);
  assert.deepEqual(parseIds(undefined), []);
});

const manyCategories = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: 100 + i,
    name: `Category ${i}`,
    slug: `category-${i}`,
    count: n - i,
  }));

test("the rail shows the biggest few categories, not every one the brand reaches", () => {
  const options = railCategoryOptions(manyCategories(41));
  assert.equal(options.length, RAIL_CATEGORY_LIMIT);
  // Listing order is preserved (count desc), so the rail does not reshuffle.
  assert.equal(options[0].value, "100");
  assert.equal(options[RAIL_CATEGORY_LIMIT - 1].value, String(100 + RAIL_CATEGORY_LIMIT - 1));
});

test("a ticked category is kept on the rail even when it falls outside the top few", () => {
  const options = railCategoryOptions(manyCategories(41), [140]);
  assert.equal(options.length, RAIL_CATEGORY_LIMIT + 1);
  assert.ok(options.some((o) => o.value === "140"));
  // ...and it keeps its listing position rather than jumping to the top.
  assert.equal(options[options.length - 1].value, "140");
});

test("a short category list is untrimmed, and every row keeps its count", () => {
  const options = railCategoryOptions(facets().categories);
  assert.deepEqual(
    options.map((o) => [o.value, o.label, o.count]),
    [
      ["11", "Combi Ovens", 12],
      ["12", "Ovens", 4],
    ]
  );
});

test("brandFacetGroups trims the Category group and keeps what is ticked", () => {
  const big = { ...facets(), categories: manyCategories(41) };
  const plain = brandFacetGroups(big, DEFAULT_STOREFRONT_FILTERS);
  assert.equal(plain[0].param, CATEGORY_PARAM);
  assert.equal(plain[0].options.length, RAIL_CATEGORY_LIMIT);

  const ticked = brandFacetGroups(big, DEFAULT_STOREFRONT_FILTERS, [140]);
  assert.equal(ticked[0].options.length, RAIL_CATEGORY_LIMIT + 1);
  assert.ok(ticked[0].options.some((o) => o.value === "140"));
});

test("a hand-typed ?cat= cannot become an unbounded bind list", () => {
  const huge = Array.from({ length: MAX_CATEGORY_IDS + 500 }, (_, i) => i + 1).join(",");
  assert.equal(parseIds(huge).length, MAX_CATEGORY_IDS);
  assert.equal(parseIds(huge)[0], 1);
});
