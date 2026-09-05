import test from "node:test";
import assert from "node:assert/strict";
import type { NodeTree, BuilderNode } from "@keenan/services/builder";
import {
  withResidentialNoticeNode,
  RESIDENTIAL_NOTICE_NODE_ID,
} from "./product-residential-notice.ts";

// The two shapes below are the LIVE published product trees, trimmed to the nodes this
// pass looks at (read off production on 2026-09-04: channel 2 = page 71, channel 1 =
// page 69). The point of the pass is that ONE rule places the line correctly on two
// independently authored templates, so the tests are written against both.

function el(id: string, children: BuilderNode[] = [], extra: Record<string, unknown> = {}): BuilderNode {
  return { id, kind: "element", tag: "div", children, ...extra } as BuilderNode;
}
function rich(id: string, path: string): BuilderNode {
  return { id, kind: "element", tag: "div", richBinding: path } as BuilderNode;
}

/** Chefs Depot: the description sits in its own `short-desc` wrapper inside the buy column. */
function cdTree(): NodeTree {
  return {
    root: el("pdp-root", [
      el("overview-wrap", [
        el("overview", [
          { id: "gallery", kind: "component", componentKey: "product-gallery" } as BuilderNode,
          el("buy", [
            el("title"),
            el("short-desc", [rich("short-desc-prose", "product.descriptionShort")]),
            { id: "price-panel-inst", kind: "component", componentKey: "price-panel" } as BuilderNode,
            { id: "actions-row-inst", kind: "component", componentKey: "actions-row" } as BuilderNode,
          ]),
        ]),
      ]),
    ]),
  } as NodeTree;
}

/** Industry Kitchens: the description is a rich div nested two deep in the buy column. */
function ikTree(): NodeTree {
  return {
    root: el("ik-root", [
      el("ik-grid", [
        { id: "ik-gallery", kind: "component", componentKey: "product-gallery" } as BuilderNode,
        el("ik-buy", [
          el("ik-title"),
          el("ik-desc-wrap", [el("ik-desc-prose", [rich("ik-desc", "product.descriptionShort")])]),
          { id: "ik-price", kind: "component", componentKey: "price-panel" } as BuilderNode,
        ]),
      ]),
    ]),
  } as NodeTree;
}

function find(node: BuilderNode, id: string): BuilderNode | null {
  if (node.id === id) return node;
  const kids = node.kind === "element" ? (node.children ?? []) : [];
  for (const k of kids) {
    const hit = find(k, id);
    if (hit) return hit;
  }
  return null;
}
function countNotices(node: BuilderNode): number {
  const self = node.id === RESIDENTIAL_NOTICE_NODE_ID ? 1 : 0;
  const kids =
    node.kind === "element"
      ? (node.children ?? [])
      : node.kind === "repeat"
        ? [...(node.children ?? []), ...(node.emptyChildren ?? [])]
        : [];
  return self + kids.reduce((n, k) => n + countNotices(k), 0);
}
/** The notice's index inside `parentId`'s children, or -1. */
function indexIn(tree: NodeTree, parentId: string): number {
  const parent = find(tree.root, parentId);
  const kids = parent && parent.kind === "element" ? (parent.children ?? []) : [];
  return kids.findIndex((k) => k.id === RESIDENTIAL_NOTICE_NODE_ID);
}

test("Chefs Depot: the line lands directly after the description", () => {
  const out = withResidentialNoticeNode(cdTree());
  assert.equal(countNotices(out.root), 1);
  assert.equal(indexIn(out, "short-desc"), 1, "immediately after short-desc-prose");
});

test("Industry Kitchens: the line lands directly after the description", () => {
  const out = withResidentialNoticeNode(ikTree());
  assert.equal(countNotices(out.root), 1);
  assert.equal(indexIn(out, "ik-desc-prose"), 1, "immediately after the bound node");
});

test("it never lands inside the related-products repeat", () => {
  const tree = {
    root: el("root", [
      { id: "rel", kind: "repeat", source: "related", children: [rich("card-desc", "product.descriptionShort")] } as BuilderNode,
      el("body", [rich("desc", "product.descriptionShort")]),
    ]),
  } as NodeTree;
  const out = withResidentialNoticeNode(tree);
  assert.equal(countNotices(out.root), 1);
  assert.equal(indexIn(out, "body"), 1);
});

test("it is idempotent — running twice places one leaf", () => {
  const once = withResidentialNoticeNode(cdTree());
  const twice = withResidentialNoticeNode(once);
  assert.equal(twice, once, "same object back, nothing re-allocated");
  assert.equal(countNotices(twice.root), 1);
});

test("an author's own placement is left alone", () => {
  const tree = cdTree();
  const buy = find(tree.root, "buy")!;
  (buy as { children: BuilderNode[] }).children.push({
    id: RESIDENTIAL_NOTICE_NODE_ID,
    kind: "component",
    componentKey: RESIDENTIAL_NOTICE_NODE_ID,
  } as BuilderNode);
  const out = withResidentialNoticeNode(tree);
  assert.equal(out, tree);
  assert.equal(countNotices(out.root), 1);
});

test("the stored tree is never mutated", () => {
  const tree = cdTree();
  const before = JSON.stringify(tree);
  withResidentialNoticeNode(tree);
  assert.equal(JSON.stringify(tree), before);
});

test("a tree with no short description falls back to the long one", () => {
  const tree = { root: el("root", [el("body", [rich("desc", "product.description")])]) } as NodeTree;
  const out = withResidentialNoticeNode(tree);
  assert.equal(indexIn(out, "body"), 1);
});

test("a tree with no description at all still gets the line, at the top", () => {
  const tree = { root: el("root", [el("a"), el("b")]) } as NodeTree;
  const out = withResidentialNoticeNode(tree);
  assert.equal(indexIn(out, "root"), 0);
});
