import { test } from "node:test";
import assert from "node:assert/strict";
import type { NodeTree, BuilderNode } from "@keenan/services/builder";
import { COMPARE_NODE_KEY, withCompareNode } from "./compare-node.ts";

// The shape of Industry Kitchens' live product template (page 69) around the buy row.
function ikTree(): NodeTree {
  return {
    v: 1,
    root: {
      id: "root",
      kind: "element",
      tag: "div",
      children: [
        {
          id: "details",
          kind: "element",
          tag: "div",
          children: [
            { id: "n-price", kind: "component", componentKey: "price-panel" },
            { id: "n-options", kind: "component", componentKey: "option-selector" },
            { id: "n-buy", kind: "component", componentKey: "actions-row" },
            { id: "ikp-clearance", kind: "element", tag: "div", children: [] },
          ],
        },
        {
          id: "related",
          kind: "repeat",
          source: "related",
          children: [{ id: "tile-buy", kind: "component", componentKey: "actions-row" }],
        } as unknown as BuilderNode,
      ],
    },
  } as NodeTree;
}

const kids = (n: BuilderNode) => (n.kind === "element" ? (n.children ?? []) : []);

test("switched off (Chefs Depot): the very same tree", () => {
  const tree = ikTree();
  assert.equal(withCompareNode(tree, { enabled: false }), tree);
});

test("placed directly under the buy row, never inside a repeat", () => {
  const tree = ikTree();
  const out = withCompareNode(tree, { enabled: true });
  const details = kids(out.root)[0];
  assert.deepEqual(
    kids(details).map((n) => n.id),
    ["n-price", "n-options", "n-buy", COMPARE_NODE_KEY, "ikp-clearance"]
  );
  const placed = kids(details)[3];
  assert.equal(placed.kind === "component" && placed.componentKey, COMPARE_NODE_KEY);
  // The stored tree is untouched.
  assert.equal(kids(kids(tree.root)[0]).length, 4);
});

test("an author's placement wins — in the page tree under any id, or inside a master", () => {
  const tree = ikTree();
  const details = kids(tree.root)[0];
  if (details.kind === "element") {
    details.children = [...(details.children ?? []), { id: "cmp-x1", kind: "component", componentKey: COMPARE_NODE_KEY }];
  }
  assert.equal(withCompareNode(tree, { enabled: true }), tree);

  const plain = ikTree();
  const master: NodeTree = {
    v: 1,
    root: { id: "m", kind: "element", tag: "div", children: [{ id: "c", kind: "component", componentKey: COMPARE_NODE_KEY }] },
  } as NodeTree;
  assert.equal(withCompareNode(plain, { enabled: true, components: { "actions-row": master } }), plain);

  // …but a leaf in a master this page does NOT place (a category tile) does not count.
  const out = withCompareNode(plain, { enabled: true, components: { "product-card": master } });
  assert.notEqual(out, plain);
  assert.ok(kids(kids(out.root)[0]).some((n) => n.id === COMPARE_NODE_KEY));
});

test("idempotent, and a tree with no buy row gets it at the end of the root", () => {
  const once = withCompareNode(ikTree(), { enabled: true });
  assert.equal(withCompareNode(once, { enabled: true }), once);

  const bare = { v: 1, root: { id: "r", kind: "element", tag: "div", children: [] } } as unknown as NodeTree;
  const out = withCompareNode(bare, { enabled: true });
  assert.deepEqual(kids(out.root).map((n) => n.id), [COMPARE_NODE_KEY]);
});
