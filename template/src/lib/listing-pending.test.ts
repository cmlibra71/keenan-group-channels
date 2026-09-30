import { test } from "node:test";
import assert from "node:assert/strict";
import type { BuilderNode, NodeTree } from "@keenan/services/builder";
import {
  LISTING_GRID_ATTR,
  overlayPendingFilters,
  toggleListParam,
  withListingGridMarks,
  withListingGridMarksAll,
} from "./listing-pending";

// ── toggleListParam ─────────────────────────────────────────────────────────

test("toggleListParam ticks a value on, keeps the others, and resets paging", () => {
  const next = toggleListParam(new URLSearchParams("brand=1&page=3&sort=price_asc"), "brand", "2");
  assert.equal(next.get("brand"), "1,2");
  assert.equal(next.get("page"), null);
  assert.equal(next.get("sort"), "price_asc");
});

test("toggleListParam ticks the last value off and drops the param", () => {
  const next = toggleListParam(new URLSearchParams("brand=2"), "brand", "2");
  assert.equal(next.has("brand"), false);
});

// ── overlayPendingFilters ───────────────────────────────────────────────────

const payload = () => ({
  context: { gst: { inclusive: false } },
  listing: {
    products: [{ id: 1 }],
    total: 40,
    sort: "relevance",
    hasActiveFilters: true,
    activeChips: [
      { param: "brand", value: "7", label: "Waldorf" },
      { param: "f_width", value: "600-900", label: "Width 600–900mm" },
    ],
    facets: {
      subcategories: [{ value: "11", label: "Cooktops", count: 4, selected: false }],
      brands: [
        { value: "7", label: "Waldorf", count: 9, selected: true },
        { value: "8", label: "Goldstein", count: 3, selected: false },
      ],
      price: [{ value: "lt1000", label: "Under $1,000", count: 2, selected: false }],
      availability: [],
      attributes: [
        { code: "width", param: "f_width", kind: "range", min: 300, max: 1800, selectedMin: 600, selectedMax: 900 },
        {
          code: "fuel",
          param: "f_fuel",
          kind: "options",
          options: [
            { value: "gas", label: "Gas", count: 5, selected: false },
            { value: "electric", label: "Electric", count: 4, selected: false },
          ],
        },
      ],
      priceRange: { min: 100, max: 90000 },
    },
  },
});

type Listing = ReturnType<typeof payload>["listing"];
const listingOf = (p: object) => (p as { listing: Listing }).listing;

test("overlay flips the tick boxes to the address the shopper just asked for", () => {
  const out = listingOf(overlayPendingFilters(payload(), new URLSearchParams("brand=8&sub=11&f_fuel=gas")));
  assert.deepEqual(
    out.facets.brands.map((b) => b.selected),
    [false, true]
  );
  assert.equal(out.facets.subcategories[0].selected, true);
  assert.deepEqual(
    out.facets.attributes[1].options?.map((o) => o.selected),
    [true, false]
  );
});

test("overlay clears a range window that is no longer on the address", () => {
  const out = listingOf(overlayPendingFilters(payload(), new URLSearchParams("brand=7")));
  assert.equal(out.facets.attributes[0].selectedMin, undefined);
  assert.equal(out.facets.attributes[0].selectedMax, undefined);
});

test("overlay reads a new range window, open at either end", () => {
  const out = listingOf(overlayPendingFilters(payload(), new URLSearchParams("f_width=450-")));
  assert.equal(out.facets.attributes[0].selectedMin, 450);
  assert.equal(out.facets.attributes[0].selectedMax, undefined);
});

test("overlay drops the chips the shopper removed and keeps the rest", () => {
  const out = listingOf(overlayPendingFilters(payload(), new URLSearchParams("f_width=600-900")));
  assert.deepEqual(
    out.activeChips.map((c) => c.param),
    ["f_width"]
  );
});

test("Clear all: nothing ticked, no chips, hasActiveFilters false", () => {
  const out = listingOf(overlayPendingFilters(payload(), new URLSearchParams("sort=price_desc")));
  assert.equal(out.hasActiveFilters, false);
  assert.equal(out.activeChips.length, 0);
  assert.equal(out.facets.brands.some((b) => b.selected), false);
  assert.equal(out.sort, "price_desc");
});

test("overlay leaves products, totals and the rest of the payload alone", () => {
  const before = payload();
  const out = overlayPendingFilters(before, new URLSearchParams("brand=8")) as ReturnType<typeof payload>;
  assert.equal(out.listing.products, before.listing.products);
  assert.equal(out.listing.total, 40);
  assert.equal(out.context, before.context);
  assert.equal(out.listing.facets.priceRange, before.listing.facets.priceRange);
});

test("overlay returns the payload itself when there is no listing", () => {
  const p = { context: {} };
  assert.equal(overlayPendingFilters(p, new URLSearchParams("brand=1")), p);
});

// ── withListingGridMarks ────────────────────────────────────────────────────

const productGrid = (): BuilderNode => ({
  id: "grid",
  kind: "element",
  tag: "div",
  classes: ["grid", "grid-cols-4"],
  children: [
    {
      id: "cards",
      kind: "repeat",
      source: "listing.products",
      as: "product",
      children: [{ id: "card", kind: "component", componentKey: "product-card" }],
    } as BuilderNode,
  ],
});

const tileGrid = (): BuilderNode => ({
  id: "tiles",
  kind: "element",
  tag: "div",
  children: [
    {
      id: "tile-repeat",
      kind: "repeat",
      source: "subcategories",
      as: "sub",
      children: [{ id: "tile", kind: "element", tag: "a" }],
    } as BuilderNode,
  ],
});

const page = (): NodeTree =>
  ({
    root: { id: "root", kind: "element", tag: "main", children: [tileGrid(), productGrid()] },
  }) as NodeTree;

const find = (node: BuilderNode, id: string): BuilderNode | undefined => {
  if (node.id === id) return node;
  const kids = node.kind === "element" || node.kind === "repeat" ? (node.children ?? []) : [];
  for (const k of kids) {
    const hit = find(k, id);
    if (hit) return hit;
  }
  return undefined;
};

const attrsOf = (n: BuilderNode | undefined) =>
  n && n.kind === "element" ? (n.attrs ?? {}) : {};

test("marks the element that holds the products repeat, and only that one", () => {
  const out = withListingGridMarks(page());
  assert.deepEqual(attrsOf(find(out.root, "grid"))[LISTING_GRID_ATTR], { kind: "static", value: "1" });
  assert.equal(attrsOf(find(out.root, "tiles"))[LISTING_GRID_ATTR], undefined);
  assert.equal(attrsOf(find(out.root, "root"))[LISTING_GRID_ATTR], undefined);
});

test("keeps the author's own attributes on the grid", () => {
  const tree = page();
  const grid = find(tree.root, "grid");
  if (grid?.kind === "element") grid.attrs = { role: { kind: "static", value: "list" } };
  const out = withListingGridMarks(tree);
  assert.deepEqual(attrsOf(find(out.root, "grid")).role, { kind: "static", value: "list" });
});

test("is idempotent and returns the same object when there is nothing to mark", () => {
  const once = withListingGridMarks(page());
  assert.equal(withListingGridMarks(once), once);
  const noGrid = { root: tileGrid() } as NodeTree;
  assert.equal(withListingGridMarks(noGrid), noGrid);
});

test("component map: only masters holding a products grid change", () => {
  const rail = { root: tileGrid() } as NodeTree;
  const listing = { root: productGrid() } as NodeTree;
  const out = withListingGridMarksAll({ "filter-rail": rail, "category-listing": listing });
  assert.equal(out["filter-rail"], rail);
  assert.notEqual(out["category-listing"], listing);
  const untouched = { "filter-rail": rail };
  assert.equal(withListingGridMarksAll(untouched), untouched);
});
