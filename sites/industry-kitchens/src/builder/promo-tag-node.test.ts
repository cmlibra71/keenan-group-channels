import { test } from "node:test";
import assert from "node:assert/strict";
import type { NodeTree, BuilderNode } from "@keenan/services/builder";

import {
  withPromoTag,
  withPromoTagInComponents,
  PRODUCT_CARD_KEY,
  PROMO_TAG_NODE_ID,
} from "./promo-tag-node";

const LABEL = "Buy more & save";

/**
 * The shape of the LIVE Chefs Depot `product-card` master (`cms_components` id 3,
 * read read-only from production on 2026-08-25), trimmed to the layers that
 * matter here. The layer names are what the transform anchors on, so a fixture
 * invented from scratch would prove nothing about the tile customers meet.
 */
function tileTree(): NodeTree {
  return {
    v: 1,
    root: {
      id: "div-cseed-32",
      kind: "element",
      tag: "div",
      label: "product-card",
      classes: ["group", "relative", "flex", "flex-col"],
      children: [
        {
          id: "a-cseed-13",
          kind: "element",
          tag: "a",
          label: "image-stage",
          classes: ["relative", "block", "aspect-square"],
          children: [
            {
              id: "div-cseed-11",
              kind: "element",
              tag: "div",
              label: "badges",
              classes: ["absolute", "left-2.5", "top-2.5"],
              children: [
                {
                  id: "span-cseed-8",
                  kind: "element",
                  tag: "span",
                  label: "badge-save",
                  classes: ["badge-save"],
                  text: [{ kind: "static", value: "Save " }],
                },
              ],
            },
          ],
        },
        {
          id: "div-cseed-31",
          kind: "element",
          tag: "div",
          label: "card-body",
          classes: ["flex", "flex-1", "flex-col", "p-4"],
          children: [
            { id: "p-cseed-14", kind: "element", tag: "p", label: "eyebrow", classes: ["mb-1"] },
            { id: "a-cseed-16", kind: "element", tag: "a", label: "name-link", classes: ["block"] },
            { id: "p-cseed-17", kind: "element", tag: "p", label: "sku", classes: ["spec-mono"] },
            {
              id: "div-cseed-20",
              kind: "element",
              tag: "div",
              label: "price-wrap",
              classes: ["mt-auto", "pt-2.5"],
              children: [{ id: "cmp-cseed-18", kind: "component", componentKey: "price-block" }],
            },
            {
              id: "div-cseed-30",
              kind: "element",
              tag: "div",
              label: "ctas",
              classes: ["mt-3", "flex", "flex-col", "gap-2"],
              children: [{ id: "cmp-cseed-21", kind: "component", componentKey: "add-to-cart" }],
            },
          ],
        },
      ],
    },
  };
}

function bodyChildren(tree: NodeTree): BuilderNode[] {
  const root = tree.root;
  const body = (root.kind === "element" ? root.children ?? [] : []).find(
    (n) => n.label === "card-body"
  );
  assert.ok(body && body.kind === "element", "fixture must carry a card-body");
  return body.children ?? [];
}

function findNode(node: BuilderNode, id: string): BuilderNode | null {
  if (node.id === id) return node;
  const kids =
    node.kind === "element"
      ? node.children ?? []
      : node.kind === "repeat"
        ? [...(node.children ?? []), ...(node.emptyChildren ?? [])]
        : [];
  for (const kid of kids) {
    const hit = findNode(kid, id);
    if (hit) return hit;
  }
  return null;
}

test("the tag lands under the price and above the buy row", () => {
  const out = withPromoTag(tileTree(), LABEL);
  const labels = bodyChildren(out).map((n) => n.label);
  assert.deepEqual(labels, ["eyebrow", "name-link", "sku", "price-wrap", "promo-tag", "ctas"]);
});

test("the pill carries the site's badge class and the exact wording", () => {
  const out = withPromoTag(tileTree(), LABEL);
  const tag = findNode(out.root, PROMO_TAG_NODE_ID);
  assert.ok(tag && tag.kind === "element");
  const pill = (tag.children ?? [])[0];
  assert.ok(pill && pill.kind === "element");
  assert.deepEqual(pill.classes, ["badge-promo"]);
  assert.deepEqual(pill.text, [{ kind: "static", value: LABEL }]);
});

test("running twice changes nothing, and returns the same object", () => {
  const once = withPromoTag(tileTree(), LABEL);
  assert.equal(withPromoTag(once, LABEL), once);
});

test("the stored tree is never mutated", () => {
  const original = tileTree();
  const snapshot = JSON.stringify(original);
  withPromoTag(original, LABEL);
  assert.equal(JSON.stringify(original), snapshot);
});

test("a master with no buy row takes the tag straight after the price block", () => {
  const tree = tileTree();
  const root = tree.root;
  assert.ok(root.kind === "element");
  const body = (root.children ?? []).find((n) => n.label === "card-body");
  assert.ok(body && body.kind === "element");
  body.children = (body.children ?? []).filter((n) => n.label !== "ctas");

  const out = withPromoTag(tree, LABEL);
  assert.deepEqual(bodyChildren(out).map((n) => n.label), [
    "eyebrow",
    "name-link",
    "sku",
    "price-wrap",
    "promo-tag",
  ]);
});

test("a master carrying neither anchor gets no tag rather than a guessed one", () => {
  const tree: NodeTree = {
    v: 1,
    root: { id: "root", kind: "element", tag: "div", children: [] },
  };
  assert.equal(withPromoTag(tree, LABEL), tree);
});

test("no wording means no tag — this is the channel gate", () => {
  const components = { [PRODUCT_CARD_KEY]: tileTree() };
  assert.equal(withPromoTagInComponents(components, null), components);
  assert.equal(withPromoTagInComponents(components, ""), components);
});

test("a site with no tile master is left alone", () => {
  const components: Record<string, NodeTree> = {};
  assert.equal(withPromoTagInComponents(components, LABEL), components);
});

test("only the tile master is rewritten; every other component is the same object", () => {
  const other = tileTree();
  const components = { [PRODUCT_CARD_KEY]: tileTree(), "price-block": other };
  const out = withPromoTagInComponents(components, LABEL);
  assert.notEqual(out[PRODUCT_CARD_KEY], components[PRODUCT_CARD_KEY]);
  assert.equal(out["price-block"], other);
});
