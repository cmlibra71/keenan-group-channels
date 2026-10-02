import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ZOEY_RANGE_PAGE_SIZE,
  brandKey,
  brandRangeRedirectTarget,
  rangeBelongsToBrand,
  rangeBrandCategoryId,
  rangePageFromSearch,
  rangePageHref,
  rangePager,
} from "./brand-range.ts";

const BRANDS = 223;

test("brandKey folds the spellings Zoey and the portal use for one brand", () => {
  assert.equal(brandKey("chefworks"), "chefworks");
  assert.equal(brandKey("chef-works"), "chefworks");
  assert.equal(brandKey("Chef Works"), "chefworks");
  assert.equal(brandKey("unox-1"), "unox");
  assert.equal(brandKey("3-monkeez"), "3monkeez");
  assert.equal(brandKey(null), "");
});

test("rangeBrandCategoryId: only categories BELOW a brand category in the Brands subtree", () => {
  // /brands/fagor/deep-fryers-3 (live ids: 223 → 8924 → 1993)
  assert.equal(rangeBrandCategoryId({ id: 1993, path_ids: [223, 8924, 1993] }, BRANDS), 8924);
  // depth-3 range keeps the brand step
  assert.equal(rangeBrandCategoryId({ id: 2985, path_ids: [223, 8498, 1458, 2985] }, BRANDS), 8498);
  // the brand category itself is not a range
  assert.equal(rangeBrandCategoryId({ id: 8924, path_ids: [223, 8924] }, BRANDS), null);
  // a shop category outside the Brands subtree
  assert.equal(rangeBrandCategoryId({ id: 872, path_ids: [227, 474, 8867, 872] }, BRANDS), null);
  // no Brands root on this storefront / no path
  assert.equal(rangeBrandCategoryId({ id: 1993, path_ids: [223, 8924, 1993] }, null), null);
  assert.equal(rangeBrandCategoryId({ id: 1993 }, BRANDS), null);
  assert.equal(rangeBrandCategoryId(null, BRANDS), null);
});

test("rangeBelongsToBrand matches the page's brand against the Zoey brand category", () => {
  const fagorCat = { slug: "fagor", name: "Fagor" };
  const fagor = { slug: "fagor-professional", name: "Fagor Professional", metafields: { aliases: ["fagor"] } };
  assert.equal(rangeBelongsToBrand(fagorCat, fagor, "fagor"), true);
  // Hatco: the Zoey brand category is `hatco-corporation` / "Hatco"; the brand row is "Hatco"
  assert.equal(rangeBelongsToBrand({ slug: "hatco-corporation", name: "Hatco" }, { slug: "hatco", name: "Hatco" }, "hatco"), true);
  // renamed slugs
  assert.equal(rangeBelongsToBrand({ slug: "chefworks", name: "ChefWorks" }, { slug: "chef-works", name: "Chef Works" }, "chef-works"), true);
  assert.equal(rangeBelongsToBrand({ slug: "unox-1", name: "UNOX" }, { slug: "unox", name: "UNOX", metafields: { aliases: ["unox-1"] } }, "unox-1"), true);
  // someone else's range typed under this brand keeps the old brand∩category rule
  assert.equal(rangeBelongsToBrand({ slug: "turbofan", name: "Turbofan" }, fagor, "fagor"), false);
  assert.equal(rangeBelongsToBrand(null, fagor, "fagor"), false);
});

test("rangePageFromSearch reads Zoey's ?p= and falls back to 1", () => {
  assert.equal(rangePageFromSearch({ p: "3" }), 3);
  assert.equal(rangePageFromSearch({ page: "2" }), 2);
  assert.equal(rangePageFromSearch({ p: ["4", "5"] }), 4);
  assert.equal(rangePageFromSearch({ p: "0" }), 1);
  assert.equal(rangePageFromSearch({ p: "-2" }), 1);
  assert.equal(rangePageFromSearch({ p: "abc" }), 1);
  assert.equal(rangePageFromSearch({}), 1);
  assert.equal(rangePageFromSearch(null), 1);
});

test("rangePager: none for one page; Zoey's 36 a page otherwise", () => {
  assert.equal(ZOEY_RANGE_PAGE_SIZE, 36);
  assert.equal(rangePager(36, 1), null);
  assert.equal(rangePager(0, 1), null);
  // UNOX CHEFTOP Plus: 38 products → 2 pages
  const unox = rangePager(38, 1)!;
  assert.equal(unox.totalPages, 2);
  assert.equal(unox.prev, null);
  assert.equal(unox.next, 2);
  assert.deepEqual([unox.from, unox.to], [1, 36]);
  const unox2 = rangePager(38, 2)!;
  assert.deepEqual([unox2.from, unox2.to, unox2.prev, unox2.next], [37, 38, 1, null]);
});

test("rangePager windows long lists with gaps and clamps the page", () => {
  // Zip HydroTap: 290 products → 9 pages
  const p = rangePager(290, 5)!;
  assert.equal(p.totalPages, 9);
  assert.deepEqual(
    p.items.map((i) => (i.kind === "gap" ? "…" : i.current ? `[${i.page}]` : String(i.page))),
    ["1", "…", "3", "4", "[5]", "6", "7", "…", "9"]
  );
  assert.equal(rangePager(290, 99)!.page, 9);
  assert.deepEqual([rangePager(290, 9)!.from, rangePager(290, 9)!.to], [289, 290]);
});

test("rangePageHref: page 1 is the bare address", () => {
  assert.equal(rangePageHref("/brands/zip-water/hydrotap", 1), "/brands/zip-water/hydrotap");
  assert.equal(rangePageHref("/brands/zip-water/hydrotap", 3), "/brands/zip-water/hydrotap?p=3");
});

test("brandRangeRedirectTarget carries the range under a renamed brand", () => {
  assert.equal(brandRangeRedirectTarget("/brands/chef-works", ["chef-shirts"]), "/brands/chef-works/chef-shirts");
  assert.equal(brandRangeRedirectTarget("/brands/3-monkeez/", ["grates--drains"]), "/brands/3-monkeez/grates--drains");
  assert.equal(brandRangeRedirectTarget("/brands/hatco", ["heat-lamps-1", "glo-ray-heat-lamps"]), "/brands/hatco/heat-lamps-1/glo-ray-heat-lamps");
  // a brand we never carried whose products live under a category: the category, as stored
  assert.equal(brandRangeRedirectTarget("/categories/festive", ["christmas"]), "/categories/festive");
  assert.equal(brandRangeRedirectTarget("/brands/chef-works", []), "/brands/chef-works");
  assert.equal(brandRangeRedirectTarget(null, ["x"]), null);
  assert.equal(brandRangeRedirectTarget("", ["x"]), null);
});
