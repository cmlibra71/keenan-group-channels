import { test } from "node:test";
import assert from "node:assert/strict";
import type { BuilderNode, NodeTree } from "@keenan/services/builder";
import {
  PRODUCT_INSTRUCTIONS_NODE_ID,
  withProductInstructionsNode,
} from "./product-instructions-node.ts";

const el = (id: string, children: BuilderNode[] = []): BuilderNode => ({
  id,
  kind: "element",
  tag: "div",
  children,
});
const comp = (id: string, componentKey: string): BuilderNode => ({ id, kind: "component", componentKey });

/** The shape both live product trees share: a buy column holding the price
 *  panel, then the bulk table, then the buy buttons. */
const tree = (): NodeTree => ({
  v: 1,
  root: el("pdp-root", [
    el("overview", [
      comp("gallery", "product-gallery"),
      el("buy", [
        el("title"),
        comp("price-panel-inst", "price-panel"),
        el("bulk"),
        comp("actions-row-inst", "actions-row"),
      ]),
    ]),
  ]),
});

const ids = (node: BuilderNode): string[] => {
  const kids =
    node.kind === "element"
      ? (node.children ?? [])
      : node.kind === "repeat"
        ? [...(node.children ?? []), ...(node.emptyChildren ?? [])]
        : [];
  return [node.id, ...kids.flatMap(ids)];
};

const childIdsOf = (node: BuilderNode, id: string): string[] => {
  if (node.id === id) return (node.kind === "element" ? node.children ?? [] : []).map((c) => c.id);
  const kids = node.kind === "element" ? node.children ?? [] : [];
  for (const kid of kids) {
    const hit = childIdsOf(kid, id);
    if (hit.length) return hit;
  }
  return [];
};

test("the panel lands immediately ABOVE the buy buttons, as Zoey has it", () => {
  const out = withProductInstructionsNode(tree());
  const buy = childIdsOf(out.root, "buy");
  assert.deepEqual(buy, [
    "title",
    "price-panel-inst",
    "bulk",
    PRODUCT_INSTRUCTIONS_NODE_ID,
    "actions-row-inst",
  ]);
});

test("it is placed exactly once", () => {
  const out = withProductInstructionsNode(tree());
  assert.equal(ids(out.root).filter((id) => id === PRODUCT_INSTRUCTIONS_NODE_ID).length, 1);
});

test("an author's own placement wins and the tree is left completely alone", () => {
  const authored: NodeTree = {
    v: 1,
    root: el("pdp-root", [
      el("buy", [comp(PRODUCT_INSTRUCTIONS_NODE_ID, PRODUCT_INSTRUCTIONS_NODE_ID), comp("a", "actions-row")]),
    ]),
  };
  assert.equal(withProductInstructionsNode(authored), authored);
});

test("no actions row: it falls back to just after the price panel", () => {
  const noActions: NodeTree = {
    v: 1,
    root: el("pdp-root", [el("buy", [comp("p", "price-panel"), el("bulk")])]),
  };
  const out = withProductInstructionsNode(noActions);
  assert.deepEqual(childIdsOf(out.root, "buy"), ["p", PRODUCT_INSTRUCTIONS_NODE_ID, "bulk"]);
});

test("no anchor at all: it still appears, at the end of the root", () => {
  const bare: NodeTree = { v: 1, root: el("pdp-root", [el("something")]) };
  const out = withProductInstructionsNode(bare);
  assert.deepEqual(childIdsOf(out.root, "pdp-root"), ["something", PRODUCT_INSTRUCTIONS_NODE_ID]);
});

test("a related-products REPEAT carrying its own buy row is never the anchor", () => {
  // The rail repeats one card subtree per related product; inserting inside it
  // would put an Instructions box on every tile and none in the buy column.
  const withRail: NodeTree = {
    v: 1,
    root: el("pdp-root", [
      {
        id: "rail",
        kind: "repeat",
        source: "related.products",
        children: [comp("card-actions", "actions-row")],
      } as BuilderNode,
      el("buy", [comp("price-panel-inst", "price-panel"), comp("actions-row-inst", "actions-row")]),
    ]),
  };
  const out = withProductInstructionsNode(withRail);
  assert.deepEqual(childIdsOf(out.root, "buy"), [
    "price-panel-inst",
    PRODUCT_INSTRUCTIONS_NODE_ID,
    "actions-row-inst",
  ]);
  assert.equal(ids(out.root).filter((id) => id === PRODUCT_INSTRUCTIONS_NODE_ID).length, 1);
});

test("the stored tree is never mutated", () => {
  const original = tree();
  const snapshot = JSON.stringify(original);
  withProductInstructionsNode(original);
  assert.equal(JSON.stringify(original), snapshot);
});
