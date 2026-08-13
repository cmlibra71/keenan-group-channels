import { test } from "node:test";
import assert from "node:assert/strict";
import type { NodeTree } from "@keenan/services/builder";
import { withProductKitNode, PRODUCT_KIT_NODE_ID } from "./product-kit-node.ts";

/** The live shape: the buy column holds the actions row as a MASTER INSTANCE. */
function liveTree(): NodeTree {
  return {
    root: {
      id: "pdp-root",
      kind: "element",
      tag: "div",
      children: [
        {
          id: "overview",
          kind: "element",
          tag: "div",
          children: [
            { id: "gallery", kind: "component", componentKey: "product-gallery" },
            {
              id: "buy",
              kind: "element",
              tag: "div",
              children: [
                { id: "title", kind: "element", tag: "h1" },
                { id: "price-panel-inst", kind: "component", componentKey: "price-panel" },
                { id: "actions-row-inst", kind: "component", componentKey: "actions-row" },
                { id: "trust", kind: "element", tag: "div" },
              ],
            },
          ],
        },
      ],
    },
  } as unknown as NodeTree;
}

/** The seed shape: the actions row is an ELEMENT carrying that id. */
function seedShapedTree(): NodeTree {
  return {
    root: {
      id: "root",
      kind: "element",
      tag: "div",
      children: [
        {
          id: "buy",
          kind: "element",
          tag: "div",
          children: [
            { id: "options", kind: "element", tag: "div" },
            { id: "actions-row", kind: "element", tag: "div", children: [] },
          ],
        },
      ],
    },
  } as unknown as NodeTree;
}

function childIds(tree: NodeTree, path: string[]): string[] {
  let node = tree.root as unknown as Record<string, unknown>;
  for (const id of path) {
    const kids = (node.children ?? []) as Array<Record<string, unknown>>;
    node = kids.find((k) => k.id === id)!;
    assert.ok(node, `no node ${id}`);
  }
  return ((node.children ?? []) as Array<{ id: string }>).map((k) => k.id);
}

test("the kit leaf lands immediately above the actions row (master instance)", () => {
  const { tree, inserted, anchorId } = withProductKitNode(liveTree());
  assert.equal(inserted, true);
  assert.equal(anchorId, "actions-row-inst");
  assert.deepEqual(childIds(tree, ["overview", "buy"]), [
    "title",
    "price-panel-inst",
    PRODUCT_KIT_NODE_ID,
    "actions-row-inst",
    "trust",
  ]);
});

test("…and above the seed's actions row element too", () => {
  const { tree, inserted } = withProductKitNode(seedShapedTree());
  assert.equal(inserted, true);
  assert.deepEqual(childIds(tree, ["buy"]), ["options", PRODUCT_KIT_NODE_ID, "actions-row"]);
});

test("the inserted node is the sealed native leaf", () => {
  const { tree } = withProductKitNode(liveTree());
  const buy = ((tree.root as unknown as { children: Array<{ children: Array<Record<string, unknown>> }> })
    .children[0].children as Array<Record<string, unknown>>)
    .find((n) => n.id === "buy") as { children: Array<Record<string, unknown>> };
  const node = buy.children.find((n) => n.id === PRODUCT_KIT_NODE_ID)!;
  assert.equal(node.kind, "component");
  assert.equal(node.componentKey, "product-kit");
});

test("idempotent — an author who placed the node keeps their placement", () => {
  const once = withProductKitNode(liveTree());
  const twice = withProductKitNode(once.tree);
  assert.equal(twice.inserted, false);
  assert.deepEqual(twice.tree, once.tree);
});

test("falls back to the buy BUTTON when a tree has no recognisable actions row", () => {
  const tree = {
    root: {
      id: "root",
      kind: "element",
      tag: "div",
      children: [
        { id: "blurb", kind: "element", tag: "p" },
        {
          id: "cta",
          kind: "element",
          tag: "button",
          events: [{ on: "click", action: { kind: "action", ref: "addToQuote" } }],
        },
      ],
    },
  } as unknown as NodeTree;
  const result = withProductKitNode(tree);
  assert.equal(result.inserted, true);
  assert.equal(result.anchorId, "cta");
  assert.deepEqual(childIds(result.tree, []), ["blurb", PRODUCT_KIT_NODE_ID, "cta"]);
});

test("a tree with no buy box is reported, not guessed at", () => {
  const tree = {
    root: { id: "root", kind: "element", tag: "div", children: [{ id: "text", kind: "element", tag: "p" }] },
  } as unknown as NodeTree;
  const result = withProductKitNode(tree);
  assert.equal(result.inserted, false);
  assert.deepEqual(result.tree, tree);
});

test("nothing else in the tree is touched", () => {
  const before = liveTree();
  const { tree } = withProductKitNode(before);
  // The original is untouched (pure), and every other node survives byte for byte.
  assert.deepEqual(before, liveTree());
  const gallery = (
    (tree.root as unknown as { children: Array<{ children: Array<Record<string, unknown>> }> }).children[0]
      .children as Array<Record<string, unknown>>
  ).find((n) => n.id === "gallery");
  assert.deepEqual(gallery, { id: "gallery", kind: "component", componentKey: "product-gallery" });
});
