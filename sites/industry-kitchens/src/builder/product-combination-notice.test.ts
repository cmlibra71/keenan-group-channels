import { test } from "node:test";
import assert from "node:assert/strict";
import type { NodeTree, BuilderNode } from "@keenan/services/builder";
import { withCombinationNoticeNode, COMBINATION_NOTICE_NODE_ID } from "./product-combination-notice";

// ============================================================================
// Card VNh9DdYd. Both shapes below are the LIVE published product templates as read
// read-only from the database on 2026-09-18:
//
//   Chefs Depot        (channel 2, page 71 / version 207) — an AUTHORED "Configure"
//     card built out of elements and a repeat over `purchase.optionGroups`, then
//     `{componentKey: "actions-row"}`.
//   Industry Kitchens  (channel 1, page 69 / version 142) — re-authored in the Site
//     Builder: `{componentKey: "option-selector"}`, then `{componentKey: "actions-row"}`.
//
// The sentence has to land between the pickers and the buy row on BOTH, without an
// id to match on.
// ============================================================================

const actionsRow: BuilderNode = { id: "actions", kind: "component", componentKey: "actions-row" };

/** Chefs Depot: the options are an authored element block, the buy row a component. */
function cdTree(): NodeTree {
  return {
    v: 1,
    root: {
      id: "pdp-root",
      kind: "element",
      tag: "div",
      children: [
        { id: "crumbs-wrap", kind: "element", tag: "div", children: [] },
        {
          id: "overview-wrap",
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
                    { id: "title", kind: "element", tag: "h1", children: [] },
                    {
                      id: "options",
                      kind: "element",
                      tag: "div",
                      children: [
                        {
                          id: "options-list",
                          kind: "element",
                          tag: "div",
                          children: [
                            {
                              id: "options-repeat",
                              kind: "repeat",
                              source: "purchase.optionGroups",
                              itemAlias: "opt",
                              children: [{ id: "opt-group", kind: "element", tag: "div", children: [] }],
                            },
                          ],
                        },
                      ],
                    },
                    { ...actionsRow, id: "actions-row-inst" },
                    { id: "trust", kind: "element", tag: "div", children: [] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  } as NodeTree;
}

/** Industry Kitchens: both the picker and the buy row are sealed components. */
function ikTree(): NodeTree {
  return {
    v: 1,
    root: {
      id: "root",
      kind: "element",
      tag: "div",
      classes: ["mx-auto", "max-w-7xl"],
      children: [
        {
          id: "overview",
          kind: "element",
          tag: "div",
          children: [
            { id: "gallery", kind: "component", componentKey: "product-gallery" },
            {
              id: "details",
              kind: "element",
              tag: "div",
              children: [
                { id: "price", kind: "component", componentKey: "price-panel" },
                { id: "bulk", kind: "component", componentKey: "bulk-tiers" },
                { id: "opts", kind: "component", componentKey: "option-selector" },
                actionsRow,
              ],
            },
          ],
        },
      ],
    },
  } as NodeTree;
}

/** Root → the notice, or null. */
function pathToNotice(node: BuilderNode, trail: string[] = []): string[] | null {
  if (node.id === COMBINATION_NOTICE_NODE_ID) return [...trail, String(node.id)];
  const kids =
    node.kind === "element"
      ? (node.children ?? [])
      : node.kind === "repeat"
        ? [...(node.children ?? []), ...(node.emptyChildren ?? [])]
        : [];
  for (const child of kids) {
    const hit = pathToNotice(child, [...trail, String(node.id)]);
    if (hit) return hit;
  }
  return null;
}

/** The ids of `parentId`'s direct children, in order. */
function childIdsOf(node: BuilderNode, parentId: string): string[] | null {
  if (node.id === parentId && node.kind === "element") {
    return (node.children ?? []).map((c) => String(c.id));
  }
  const kids = node.kind === "element" ? (node.children ?? []) : [];
  for (const child of kids) {
    const hit = childIdsOf(child, parentId);
    if (hit) return hit;
  }
  return null;
}

test("Chefs Depot: the sentence lands between the Configure card and the buy row", () => {
  const out = withCombinationNoticeNode(cdTree());
  assert.deepEqual(childIdsOf(out.root, "buy"), [
    "title",
    "options",
    COMBINATION_NOTICE_NODE_ID,
    "actions-row-inst",
    "trust",
  ]);
});

test("Industry Kitchens: the sentence lands between the sealed picker and the buy row", () => {
  const out = withCombinationNoticeNode(ikTree());
  assert.deepEqual(childIdsOf(out.root, "details"), [
    "price",
    "bulk",
    "opts",
    COMBINATION_NOTICE_NODE_ID,
    "actions",
  ]);
});

test("a tree with pickers but no recognisable buy row still gets it, right after the pickers", () => {
  const tree = {
    v: 1,
    root: {
      id: "root",
      kind: "element",
      tag: "div",
      children: [
        { id: "opts", kind: "component", componentKey: "option-selector" },
        { id: "tabs", kind: "component", componentKey: "product-tabs" },
      ],
    },
  } as NodeTree;
  assert.deepEqual(childIdsOf(withCombinationNoticeNode(tree).root, "root"), [
    "opts",
    COMBINATION_NOTICE_NODE_ID,
    "tabs",
  ]);
});

test("a tree with neither still gets it, at the end of the root rather than nowhere", () => {
  const tree = {
    v: 1,
    root: { id: "root", kind: "element", tag: "div", children: [{ id: "only", kind: "element", tag: "p", children: [] }] },
  } as NodeTree;
  assert.deepEqual(childIdsOf(withCombinationNoticeNode(tree).root, "root"), [
    "only",
    COMBINATION_NOTICE_NODE_ID,
  ]);
});

test("it never lands inside a repeat — a related-products tile is not the place for it", () => {
  const out = withCombinationNoticeNode(cdTree());
  const path = pathToNotice(out.root);
  assert.ok(path, "the notice was placed");
  assert.ok(!path!.includes("options-repeat"), `placed inside a repeat: ${path!.join(" > ")}`);
});

test("an author's own placement wins — running it again changes nothing", () => {
  const once = withCombinationNoticeNode(cdTree());
  const twice = withCombinationNoticeNode(once);
  assert.equal(twice, once, "the same tree object comes back");
  assert.deepEqual(childIdsOf(twice.root, "buy"), childIdsOf(once.root, "buy"));
});

test("the stored tree is never mutated", () => {
  const tree = cdTree();
  const before = JSON.stringify(tree);
  withCombinationNoticeNode(tree);
  assert.equal(JSON.stringify(tree), before);
});
