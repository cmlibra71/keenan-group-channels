import test from "node:test";
import assert from "node:assert/strict";
import type { NodeTree } from "@keenan/services/builder";
import { stripStockNodes, findStockWording, STOCK_NODE_IDS } from "./strip-stock-nodes";
import { SEED_PRODUCT_TREE } from "./seeds/product";

// A miniature of the shape the seed produced and every authored product template
// inherited: the ships-to-order paragraph as a sibling of the trust row, and the
// stock chip as the third child of that row.
function productTemplate(): NodeTree {
  return {
    v: 1,
    root: {
      id: "pdp-root",
      kind: "element",
      tag: "div",
      children: [
        { id: "actions", kind: "element", tag: "div", children: [] },
        {
          id: "ships-note",
          kind: "element",
          tag: "p",
          text: [{ kind: "static", value: "Ships to order — Add to Cart or Add to Quote and we'll confirm delivery timing." }],
        },
        {
          id: "trust",
          kind: "element",
          tag: "div",
          children: [
            { id: "trust-ship-t", kind: "element", tag: "span", text: [{ kind: "static", value: "Australia-wide delivery" }] },
            { id: "trust-war-t", kind: "element", tag: "span", text: [{ kind: "static", value: "Manufacturer warranty" }] },
            {
              id: "trust-stock",
              kind: "element",
              tag: "span",
              children: [
                { id: "trust-stock-t", kind: "element", tag: "span", text: [{ kind: "static", value: "In stock" }] },
                { id: "trust-stock-out", kind: "element", tag: "span", text: [{ kind: "static", value: "Check availability" }] },
              ],
            },
          ],
        },
      ],
    },
  } as unknown as NodeTree;
}

// The listing tile's badge row, as it exists in the stored `product-card`
// component master: generated node ids, so the badge is only identifiable by its
// class (and its label).
function productCardComponent(): NodeTree {
  return {
    v: 1,
    root: {
      id: "card-root",
      kind: "element",
      tag: "div",
      children: [
        {
          id: "span-cseed-7",
          kind: "element",
          tag: "div",
          children: [
            { id: "span-cseed-8", kind: "element", tag: "span", classes: ["badge-save"], text: [{ kind: "static", value: "Save 20%" }] },
            { id: "span-cseed-9", kind: "element", tag: "span", classes: ["badge-clearance"], text: [{ kind: "static", value: "Clearance" }] },
            {
              id: "span-cseed-10",
              kind: "element",
              tag: "span",
              classes: ["badge-stock-low"],
              condition: { kind: "expr", source: "props.card.low_stock" },
              text: [{ kind: "static", value: "Low Stock" }],
            },
          ],
        },
      ],
    },
  } as unknown as NodeTree;
}

test("strips the ships-to-order note and the whole stock chip", () => {
  const { tree, removed } = stripStockNodes(productTemplate());
  assert.deepEqual(removed.sort(), ["ships-note", "trust-stock"]);
  assert.deepEqual(findStockWording(tree), []);
});

test("leaves the rest of the trust row exactly as it was", () => {
  const { tree } = stripStockNodes(productTemplate());
  const json = JSON.stringify(tree);
  assert.ok(json.includes("Australia-wide delivery"));
  assert.ok(json.includes("Manufacturer warranty"));
  const trust = (tree.root as { children: { id: string; children?: { id: string }[] }[] }).children.find(
    (c) => c.id === "trust"
  );
  assert.deepEqual(trust?.children?.map((c) => c.id), ["trust-ship-t", "trust-war-t"]);
});

test("strips the Low Stock badge from a component master by its class", () => {
  const { tree, removed } = stripStockNodes(productCardComponent());
  assert.deepEqual(removed, ["span-cseed-10"]);
  assert.deepEqual(findStockWording(tree), []);
});

test("keeps the Save and Clearance badges beside it", () => {
  const { tree } = stripStockNodes(productCardComponent());
  const row = (tree.root as { children: { children: { id: string }[] }[] }).children[0];
  assert.deepEqual(row.children.map((c) => c.id), ["span-cseed-8", "span-cseed-9"]);
  // "Clearance" is the section's marketing name, not stock status — it stays.
  assert.ok(JSON.stringify(tree).includes("Clearance"));
});

test("is idempotent — a second pass removes nothing", () => {
  for (const make of [productTemplate, productCardComponent]) {
    const once = stripStockNodes(make());
    const twice = stripStockNodes(once.tree);
    assert.deepEqual(twice.removed, []);
    assert.equal(JSON.stringify(twice.tree), JSON.stringify(once.tree));
  }
});

test("a tree that never had the nodes is untouched", () => {
  const clean: NodeTree = {
    v: 1,
    root: { id: "pdp-root", kind: "element", tag: "div", children: [{ id: "trust", kind: "element", tag: "div", children: [] }] },
  } as unknown as NodeTree;
  const { tree, removed } = stripStockNodes(clean);
  assert.deepEqual(removed, []);
  assert.equal(JSON.stringify(tree), JSON.stringify(clean));
});

test("does not mutate the input tree", () => {
  const input = productTemplate();
  const before = JSON.stringify(input);
  stripStockNodes(input);
  assert.equal(JSON.stringify(input), before);
});

test("a node that merely CONTAINS a stock badge is kept, only the badge goes", () => {
  const nested: NodeTree = {
    v: 1,
    root: {
      id: "root",
      kind: "element",
      tag: "div",
      children: [
        {
          id: "tile",
          kind: "element",
          tag: "div",
          text: [{ kind: "static", value: "Some product" }],
          children: [{ id: "badge", kind: "element", tag: "span", classes: ["badge-stock-low"], text: [{ kind: "static", value: "Low Stock" }] }],
        },
      ],
    },
  } as unknown as NodeTree;
  const { tree, removed } = stripStockNodes(nested);
  assert.deepEqual(removed, ["badge"]);
  assert.ok(JSON.stringify(tree).includes("Some product"));
});

test("the shipped seed carries no stock wording and needs no stripping", () => {
  // The seed is the fallback tree for any site whose product template was never
  // authored. If this fails the wording has crept back into the source.
  assert.deepEqual(findStockWording(SEED_PRODUCT_TREE as unknown as NodeTree), []);
  assert.deepEqual(stripStockNodes(SEED_PRODUCT_TREE as unknown as NodeTree).removed, []);
});

test("the id list is the two product-page nodes the card names", () => {
  assert.deepEqual([...STOCK_NODE_IDS], ["ships-note", "trust-stock"]);
});
