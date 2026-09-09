import test from "node:test";
import assert from "node:assert/strict";
import type { NodeTree, BuilderNode } from "@keenan/services/builder";
import { withPackNoteNode, PACK_NOTE_NODE_ID } from "./product-pack-note";

// The shape both live product trees share inside the buy column, read off production on
// 2026-09-05: channel 2 page 71 v207 (`price-panel-inst` then `actions-row-inst`) and channel 1
// page 69 v142 (the same two component keys under generated ids).
function liveShape(): NodeTree {
  return {
    v: 1,
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
              ],
            },
          ],
        },
        {
          id: "related-repeat",
          kind: "repeat",
          path: "related",
          as: "card",
          children: [{ id: "rc-card-inst", kind: "component", componentKey: "product-card" }],
        },
      ],
    },
  } as NodeTree;
}

function childIds(tree: NodeTree, id: string): string[] {
  const find = (n: BuilderNode): BuilderNode | null => {
    if (n.id === id) return n;
    const kids = n.kind === "element" ? (n.children ?? []) : [];
    for (const k of kids) {
      const hit = find(k);
      if (hit) return hit;
    }
    return null;
  };
  const node = find(tree.root);
  const kids = node && node.kind === "element" ? (node.children ?? []) : [];
  return kids.map((k) => k.id);
}

test("the note lands between the price and the buy buttons, where Zoey puts it", () => {
  const out = withPackNoteNode(liveShape());
  assert.deepEqual(childIds(out, "buy"), [
    "title",
    "price-panel-inst",
    PACK_NOTE_NODE_ID,
    "actions-row-inst",
  ]);
});

test("a tree with no actions row falls back to just after the price panel", () => {
  const tree = liveShape();
  const overview = (tree.root as { children: BuilderNode[] }).children[0] as {
    children: BuilderNode[];
  };
  const buy = overview.children[1] as { children: BuilderNode[] };
  buy.children = buy.children.filter((c) => c.kind !== "component" || c.componentKey !== "actions-row");
  const out = withPackNoteNode(tree);
  assert.deepEqual(childIds(out, "buy"), ["title", "price-panel-inst", PACK_NOTE_NODE_ID]);
});

test("a tree with neither still gets the note rather than losing it silently", () => {
  const tree: NodeTree = {
    v: 1,
    root: { id: "root", kind: "element", tag: "div", children: [{ id: "x", kind: "element", tag: "p" }] },
  } as NodeTree;
  const out = withPackNoteNode(tree);
  assert.deepEqual(childIds(out, "root"), [PACK_NOTE_NODE_ID, "x"]);
});

test("an author's own placement is kept, and a second pass changes nothing", () => {
  const once = withPackNoteNode(liveShape());
  const twice = withPackNoteNode(once);
  assert.equal(twice, once, "second pass must return the same object");
  assert.equal(
    JSON.stringify(once).split(`"componentKey":"${PACK_NOTE_NODE_ID}"`).length - 1,
    1,
    "exactly one pack-note node"
  );
});

test("the stored tree is never mutated", () => {
  const tree = liveShape();
  const before = JSON.stringify(tree);
  withPackNoteNode(tree);
  assert.equal(JSON.stringify(tree), before);
});

test("a repeat's item subtree is never used as the anchor", () => {
  // A related-products card is a `product-card` instance inside a repeat; nothing in there may
  // attract the note, or every tile on the rail would carry one.
  const out = withPackNoteNode(liveShape());
  const rail = JSON.stringify(
    ((out.root as { children?: BuilderNode[] }).children ?? []).find(
      (c) => c.id === "related-repeat"
    )
  );
  assert.ok(!rail.includes(PACK_NOTE_NODE_ID));
});
