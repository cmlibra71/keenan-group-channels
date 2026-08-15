import { test } from "node:test";
import assert from "node:assert/strict";
import type { BuilderNode, NodeTree } from "@keenan/services/builder";
import { SILVERCHEF_NODE_ID, withSilverChefNode } from "./silverchef-node.ts";

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

/** Every id in the tree, repeat subtrees INCLUDED — so "the panel appears
 *  exactly once" is a claim about the whole tree, not only the part the
 *  inserter is allowed to walk. */
const ids = (node: BuilderNode): string[] => {
  const kids =
    node.kind === "element"
      ? (node.children ?? [])
      : node.kind === "repeat"
        ? [...(node.children ?? []), ...(node.emptyChildren ?? [])]
        : [];
  return [node.id, ...kids.flatMap(ids)];
};
const buyRow = (t: NodeTree): string[] => {
  const overview = (t.root as { children: BuilderNode[] }).children[0] as { children: BuilderNode[] };
  const buy = overview.children[1] as { children: BuilderNode[] };
  return buy.children.map((c) => c.id);
};

test("the panel lands immediately after the price panel", () => {
  const out = withSilverChefNode(tree());
  assert.deepEqual(buyRow(out), ["title", "price-panel-inst", SILVERCHEF_NODE_ID, "bulk", "actions-row-inst"]);
});

test("the stored tree is never mutated", () => {
  const original = tree();
  const snapshot = JSON.stringify(original);
  withSilverChefNode(original);
  assert.equal(JSON.stringify(original), snapshot);
});

test("an author's own placement wins and nothing is added", () => {
  const authored = tree();
  const overview = (authored.root as { children: BuilderNode[] }).children[0] as { children: BuilderNode[] };
  (overview.children[1] as { children: BuilderNode[] }).children.unshift(
    comp(SILVERCHEF_NODE_ID, SILVERCHEF_NODE_ID)
  );
  const out = withSilverChefNode(authored);
  assert.equal(out, authored, "the same tree object comes back");
  assert.equal(ids(out.root).filter((id) => id === SILVERCHEF_NODE_ID).length, 1);
});

test("with no price panel it goes above the buy buttons instead", () => {
  const t: NodeTree = {
    v: 1,
    root: el("pdp-root", [el("buy", [el("title"), comp("actions-row-inst", "actions-row")])]),
  };
  const out = withSilverChefNode(t);
  const buy = (out.root as { children: BuilderNode[] }).children[0] as { children: BuilderNode[] };
  assert.deepEqual(
    buy.children.map((c) => c.id),
    ["title", SILVERCHEF_NODE_ID, "actions-row-inst"]
  );
});

test("a tree with neither anchor still gets the panel", () => {
  const t: NodeTree = { v: 1, root: el("pdp-root", [el("prose")]) };
  const out = withSilverChefNode(t);
  assert.ok(ids(out.root).includes(SILVERCHEF_NODE_ID));
});

test("the panel is never dropped inside a repeat", () => {
  const t: NodeTree = {
    v: 1,
    root: el("pdp-root", [
      { id: "related", kind: "repeat", source: "related", children: [comp("card-price", "price-panel")] },
      el("buy", [comp("price-panel-inst", "price-panel")]),
    ]),
  };
  const out = withSilverChefNode(t);
  const buy = (out.root as { children: BuilderNode[] }).children[1] as { children: BuilderNode[] };
  assert.deepEqual(
    buy.children.map((c) => c.id),
    ["price-panel-inst", SILVERCHEF_NODE_ID]
  );
});

// The regression the first cut shipped: the related-products strip is a repeat
// wrapping a CARD element that holds the price panel, so the anchor inside the
// repeat is one level deeper than the test above reaches. The old walk found it
// first, rebuilt a subtree it was not allowed to insert into, and returned a
// tree with no panel in it at all — success reported, panel gone from every
// product page on the site.
test("a price panel nested inside a repeat is skipped, not silently swallowed", () => {
  const t: NodeTree = {
    v: 1,
    root: el("pdp-root", [
      {
        id: "related",
        kind: "repeat",
        source: "related",
        children: [el("card", [comp("card-price", "price-panel")])],
      },
      el("buy", [comp("price-panel-inst", "price-panel"), comp("actions-row-inst", "actions-row")]),
    ]),
  };
  const out = withSilverChefNode(t);
  assert.ok(ids(out.root).includes(SILVERCHEF_NODE_ID), "the panel must survive");
  const buy = (out.root as { children: BuilderNode[] }).children[1] as { children: BuilderNode[] };
  assert.deepEqual(
    buy.children.map((c) => c.id),
    ["price-panel-inst", SILVERCHEF_NODE_ID, "actions-row-inst"]
  );
  // And exactly once — never once per related-product card.
  assert.equal(ids(out.root).filter((id) => id === SILVERCHEF_NODE_ID).length, 1);
});

test("with the ONLY price panel inside a repeat, the fallback anchor fires", () => {
  const t: NodeTree = {
    v: 1,
    root: el("pdp-root", [
      {
        id: "related",
        kind: "repeat",
        source: "related",
        children: [el("card", [comp("card-price", "price-panel")])],
      },
      el("buy", [el("title"), comp("actions-row-inst", "actions-row")]),
    ]),
  };
  const out = withSilverChefNode(t);
  const buy = (out.root as { children: BuilderNode[] }).children[1] as { children: BuilderNode[] };
  assert.deepEqual(
    buy.children.map((c) => c.id),
    ["title", SILVERCHEF_NODE_ID, "actions-row-inst"]
  );
});
