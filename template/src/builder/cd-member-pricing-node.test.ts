import { test } from "node:test";
import assert from "node:assert/strict";
import type { BuilderNode, NodeTree } from "@keenan/services/builder";
import { CD_MEMBER_PRICING_NODE_ID, withCdMemberPricingNode } from "./cd-member-pricing-node.ts";
import { SILVERCHEF_NODE_ID, withSilverChefNode } from "./silverchef-node.ts";

const el = (id: string, children: BuilderNode[] = []): BuilderNode => ({
  id,
  kind: "element",
  tag: "div",
  children,
});
const comp = (id: string, componentKey: string): BuilderNode => ({
  id,
  kind: "component",
  componentKey,
});

/** The shape both live product trees share. */
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
const buyRow = (t: NodeTree): string[] => {
  const overview = (t.root as { children: BuilderNode[] }).children[0] as {
    children: BuilderNode[];
  };
  const buy = overview.children[1] as { children: BuilderNode[] };
  return buy.children.map((c) => c.id);
};

test("with no SilverChef panel, the ladder lands straight after the price panel", () => {
  const out = withCdMemberPricingNode(tree());
  assert.deepEqual(buyRow(out), [
    "title",
    "price-panel-inst",
    CD_MEMBER_PRICING_NODE_ID,
    "bulk",
    "actions-row-inst",
  ]);
});

test("the money block reads price, weekly rent, then ladder — in that order", () => {
  // This is the order the branch actually produces: SilverChef is placed first.
  const out = withCdMemberPricingNode(withSilverChefNode(tree()));
  assert.deepEqual(buyRow(out), [
    "title",
    "price-panel-inst",
    SILVERCHEF_NODE_ID,
    CD_MEMBER_PRICING_NODE_ID,
    "bulk",
    "actions-row-inst",
  ]);
});

test("the stored tree is never mutated", () => {
  const original = tree();
  const snapshot = JSON.stringify(original);
  withCdMemberPricingNode(original);
  assert.equal(JSON.stringify(original), snapshot);
});

test("an author's own placement wins and is never doubled", () => {
  const authored = tree();
  (
    (authored.root as { children: BuilderNode[] }).children[0] as { children: BuilderNode[] }
  ).children.push(comp(CD_MEMBER_PRICING_NODE_ID, CD_MEMBER_PRICING_NODE_ID));
  const out = withCdMemberPricingNode(authored);
  assert.equal(out, authored, "an already-placed tree comes back untouched");
  assert.equal(ids(out.root).filter((id) => id === CD_MEMBER_PRICING_NODE_ID).length, 1);
});

test("with no price panel it falls back to sitting before the buy actions", () => {
  const t: NodeTree = {
    v: 1,
    root: el("pdp-root", [el("title"), comp("actions-row-inst", "actions-row")]),
  };
  const out = withCdMemberPricingNode(t);
  assert.deepEqual((out.root as { children: BuilderNode[] }).children.map((c) => c.id), [
    "title",
    CD_MEMBER_PRICING_NODE_ID,
    "actions-row-inst",
  ]);
});

test("a related-products REPEAT carrying its own price panel is never entered", () => {
  // The failure this guards: the strip's price panel is found first, the walk
  // rebuilds a subtree it may not insert into, and the panel vanishes from every
  // product page on the site with success reported and no error anywhere.
  const t: NodeTree = {
    v: 1,
    root: el("pdp-root", [
      {
        id: "related",
        kind: "repeat",
        children: [el("card", [comp("card-price", "price-panel")])],
      } as BuilderNode,
      el("buy", [comp("price-panel-inst", "price-panel"), comp("actions-row-inst", "actions-row")]),
    ]),
  };
  const out = withCdMemberPricingNode(t);
  const buy = (out.root as { children: BuilderNode[] }).children[1] as { children: BuilderNode[] };
  assert.deepEqual(buy.children.map((c) => c.id), [
    "price-panel-inst",
    CD_MEMBER_PRICING_NODE_ID,
    "actions-row-inst",
  ]);
  assert.equal(ids(out.root).filter((id) => id === CD_MEMBER_PRICING_NODE_ID).length, 1);
});

test("a tree with none of the anchors still gets the panel", () => {
  const t: NodeTree = { v: 1, root: el("pdp-root", [el("title"), el("copy")]) };
  const out = withCdMemberPricingNode(t);
  assert.ok(ids(out.root).includes(CD_MEMBER_PRICING_NODE_ID));
});
