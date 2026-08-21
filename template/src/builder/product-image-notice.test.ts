import { test } from "node:test";
import assert from "node:assert/strict";
import type { NodeTree, BuilderNode } from "@keenan/services/builder";
import { withImageNoticeNode, IMAGE_NOTICE_NODE_ID } from "./product-image-notice";

// ============================================================================
// Card 82HgV23q. The two shapes below are the LIVE published product templates
// as read from the database on 2026-08-17:
//
//   Chefs Depot (channel 2, page 71 / version 97) keeps the seed's ids — a bare
//     root, and each section wraps itself in `mx-auto max-w-7xl px-4 …`.
//   Industry Kitchens (channel 1, page 69 / version 142) was re-authored in the
//     Site Builder — generated ids, and the ROOT carries the width classes while
//     the two-column grid sits directly under it.
//
// The banner has to land above the gallery on BOTH, without an id to match on.
// ============================================================================

const gallery: BuilderNode = { id: "gallery", kind: "component", componentKey: "product-gallery" };

function cdTree(): NodeTree {
  return {
    v: 1,
    root: {
      id: "pdp-root",
      kind: "element",
      tag: "div",
      children: [
        { id: "crumbs-wrap", kind: "element", tag: "div", classes: ["mx-auto", "max-w-7xl", "px-4"], children: [] },
        {
          id: "overview-wrap",
          kind: "element",
          tag: "div",
          classes: ["mx-auto", "max-w-7xl", "px-4"],
          children: [
            {
              id: "overview",
              kind: "element",
              tag: "div",
              classes: ["grid", "grid-cols-1", "lg:grid-cols-2", "gap-12"],
              children: [gallery, { id: "buy", kind: "element", tag: "div", children: [] }],
            },
          ],
        },
      ],
    },
  } as NodeTree;
}

function ikTree(): NodeTree {
  return {
    v: 1,
    root: {
      id: "n-root",
      kind: "element",
      tag: "div",
      classes: ["mx-auto", "max-w-7xl", "px-4", "sm:px-6", "lg:px-8", "py-8"],
      children: [
        { id: "n-crumbs", kind: "element", tag: "nav", classes: ["flex", "mb-6"], children: [] },
        {
          id: "n-grid",
          kind: "element",
          tag: "div",
          classes: ["grid", "grid-cols-1", "lg:grid-cols-2", "gap-12"],
          children: [gallery, { id: "n-buy", kind: "element", tag: "div", children: [] }],
        },
      ],
    },
  } as NodeTree;
}

/** [parentId, indexWithinParent] of the notice, or null. */
function findNotice(node: BuilderNode): [string, number] | null {
  if (node.kind !== "element") return null;
  const kids = node.children ?? [];
  const at = kids.findIndex((k) => k.id === IMAGE_NOTICE_NODE_ID);
  if (at >= 0) return [String(node.id), at];
  for (const k of kids) {
    const hit = findNotice(k);
    if (hit) return hit;
  }
  return null;
}

function count(node: BuilderNode): number {
  const self = node.id === IMAGE_NOTICE_NODE_ID ? 1 : 0;
  const kids = node.kind === "element" ? (node.children ?? []) : [];
  return kids.reduce((n, k) => n + count(k), self);
}

test("Chefs Depot: the banner sits inside the content wrapper, above the gallery grid", () => {
  const out = withImageNoticeNode(cdTree());
  assert.deepEqual(findNotice(out.root), ["overview-wrap", 0]);
});

test("Industry Kitchens: the banner sits under the root's width classes, above the grid", () => {
  const out = withImageNoticeNode(ikTree());
  // After the breadcrumbs (index 0), immediately before the two-column grid.
  assert.deepEqual(findNotice(out.root), ["n-root", 1]);
});

test("the pass is idempotent and never places a second banner", () => {
  const once = withImageNoticeNode(cdTree());
  const twice = withImageNoticeNode(once);
  assert.equal(twice, once, "a tree that already carries the leaf comes back unchanged");
  assert.equal(count(twice.root), 1);
});

test("an author's own placement wins", () => {
  const tree = cdTree();
  (tree.root as { children: BuilderNode[] }).children.push({
    id: IMAGE_NOTICE_NODE_ID,
    kind: "component",
    componentKey: IMAGE_NOTICE_NODE_ID,
  });
  const out = withImageNoticeNode(tree);
  assert.equal(out, tree);
  assert.equal(count(out.root), 1);
});

test("the source tree is never mutated", () => {
  const tree = cdTree();
  const before = JSON.stringify(tree);
  withImageNoticeNode(tree);
  assert.equal(JSON.stringify(tree), before);
});

test("a related-products repeat is not mistaken for the gallery's home", () => {
  const tree: NodeTree = {
    v: 1,
    root: {
      id: "root",
      kind: "element",
      tag: "div",
      children: [
        {
          id: "related",
          kind: "repeat",
          source: "related.products",
          itemAlias: "card",
          children: [{ id: "card-img", kind: "component", componentKey: "product-gallery" }],
        },
      ],
    },
  } as NodeTree;
  const out = withImageNoticeNode(tree);
  // No reachable gallery, so the fallback puts it at the top of the root — never
  // inside the repeat, where it would render once per related product.
  assert.deepEqual(findNotice(out.root), ["root", 0]);
  assert.equal(count(out.root), 1);
});

test("a tree with no gallery at all still gets the banner", () => {
  const tree: NodeTree = {
    v: 1,
    root: { id: "root", kind: "element", tag: "div", children: [{ id: "a", kind: "element", tag: "p", children: [] }] },
  } as NodeTree;
  const out = withImageNoticeNode(tree);
  assert.deepEqual(findNotice(out.root), ["root", 0]);
});
