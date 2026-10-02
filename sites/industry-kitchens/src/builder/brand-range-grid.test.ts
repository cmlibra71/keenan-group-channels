import { test } from "node:test";
import assert from "node:assert/strict";
import type { NodeTree } from "@keenan/services/builder";
import { brandTemplateProductGrid, rangeListingSettings, rangeListingSource } from "./brand-range-grid.ts";

// The shape of Industry Kitchens' live `__brand__` template (cms_pages 59), trimmed.
function brandTemplate(): NodeTree {
  return {
    v: 1,
    root: {
      id: "page",
      kind: "element",
      tag: "div",
      children: [
        { id: "crumbs", kind: "element", tag: "nav", children: [] },
        { id: "intro", kind: "component", componentKey: "brand-intro", props: {} },
        {
          id: "products",
          kind: "element",
          tag: "div",
          condition: { kind: "expr", source: "total > 0" },
          children: [
            { id: "h2", kind: "element", tag: "h2", text: [{ kind: "static", value: "Products" }] },
            {
              id: "grid",
              kind: "element",
              tag: "div",
              classes: ["grid", "grid-cols-2", "lg:grid-cols-4", "gap-6"],
              children: [
                {
                  id: "rep",
                  kind: "repeat",
                  source: "products",
                  itemAlias: "card",
                  children: [
                    {
                      id: "card",
                      kind: "component",
                      componentKey: "product-card",
                      props: { card: { kind: "binding", path: "card" } },
                    },
                  ],
                },
              ],
            },
          ],
        },
        { id: "faq", kind: "component", componentKey: "brand-faq", props: {} },
      ],
    },
  } as unknown as NodeTree;
}

test("lifts the element that repeats the product-card master over products — and nothing else", () => {
  const grid = brandTemplateProductGrid(brandTemplate());
  assert.ok(grid);
  assert.equal(grid.v, 1);
  assert.equal(grid.root.id, "grid");
  assert.deepEqual((grid.root as { classes?: string[] }).classes, ["grid", "grid-cols-2", "lg:grid-cols-4", "gap-6"]);
  // The brand's own furniture (crumbs, intro, "Products" heading, FAQ) is not carried.
  const ids = JSON.stringify(grid).match(/"id":"[^"]+"/g);
  assert.deepEqual(ids, ['"id":"grid"', '"id":"rep"', '"id":"card"']);
});

test("drops the grid's own condition and never mutates the stored tree", () => {
  const tree = brandTemplate();
  const before = JSON.stringify(tree);
  const products = (tree.root as { children: { id: string; children?: unknown[] }[] }).children[2];
  const gridNode = products.children![1] as Record<string, unknown>;
  gridNode.condition = { kind: "expr", source: "total > 0" };
  const withCond = JSON.stringify(tree);
  const grid = brandTemplateProductGrid(tree);
  assert.equal((grid!.root as { condition?: unknown }).condition, undefined);
  assert.equal(JSON.stringify(tree), withCond);
  assert.notEqual(before, withCond);
});

test("null when the template repeats something else, repeats another source, or is missing", () => {
  assert.equal(brandTemplateProductGrid(null), null);
  assert.equal(brandTemplateProductGrid({}), null);
  const otherKey = JSON.parse(JSON.stringify(brandTemplate()).replace('"product-card"', '"brand-tile"'));
  assert.equal(brandTemplateProductGrid(otherKey), null);
  const otherSource = JSON.parse(JSON.stringify(brandTemplate()).replace('"source":"products"', '"source":"brand.meta.faq"'));
  assert.equal(brandTemplateProductGrid(otherSource), null);
});

test("finds a card nested inside a wrapper within the repeat", () => {
  const t = JSON.parse(
    JSON.stringify(brandTemplate()).replace(
      '"children":[{"id":"card"',
      '"children":[{"id":"wrap","kind":"element","tag":"div","children":[{"id":"card"'
    ).replace('"path":"card"}}}]', '"path":"card"}}}]}]')
  );
  assert.equal(brandTemplateProductGrid(t)?.root.id, "grid");
});

test("range switches win key by key; unset keys fall through to the brand's", () => {
  const range = { zoey_listing: { add_to_cart: true, qty: true } };
  const brand = { zoey_listing: { add_to_cart: false, compare: false, wishlist: false, qty: false } };
  // Tablekraft Atlantis: the range shows buttons + qty where the brand page hides them.
  assert.deepEqual(rangeListingSettings(range, brand), { add_to_cart: true, compare: false, wishlist: false, qty: true });
  // Not listing the range's own products (unresolved / empty range): the brand page's switches.
  assert.deepEqual(rangeListingSettings(null, brand), { add_to_cart: false, compare: false, wishlist: false, qty: false });
  // Neither set: every switch unset (tiles keep the master's defaults).
  assert.deepEqual(rangeListingSettings({}, null), { add_to_cart: null, compare: null, wishlist: null, qty: null });
});

test("rangeListingSource: the resolved listing_effective wins over the range's own metafields", () => {
  const brand = { zoey_listing: { add_to_cart: false, compare: false, wishlist: false, qty: false } };
  const range = {
    metafields: { zoey_listing: { add_to_cart: true } },
    // Range set to Inherit in the portal: its parent category (the brand category) shows buttons.
    listing_effective: { add_to_cart: true, compare: null, wishlist: null, qty: true },
  };
  assert.deepEqual(rangeListingSettings(rangeListingSource(range), brand), { add_to_cart: true, compare: false, wishlist: false, qty: true });
  // A row without it (older services) reads its own metafields, as before.
  assert.deepEqual(rangeListingSource({ metafields: { zoey_listing: { qty: true } } }), { zoey_listing: { qty: true } });
  assert.equal(rangeListingSource(null), null);
});
