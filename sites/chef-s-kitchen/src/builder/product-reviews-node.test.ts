import { test } from "node:test";
import assert from "node:assert/strict";
import type { BuilderNode, NodeTree } from "@keenan/services/builder";
import {
  PRODUCT_REVIEWS_NODE_ID,
  withReviewsBlock,
  withReviewsBlockInComponents,
} from "./product-reviews-node.ts";

const el = (id: string, children: BuilderNode[] = []): BuilderNode => ({
  id,
  kind: "element",
  tag: "div",
  children,
});

const reviewsRepeat = (id = "reviews-repeat", source = "reviews.list"): BuilderNode => ({
  id,
  kind: "repeat",
  source,
  itemAlias: "review",
  children: [el("review-card", [el("review-title"), el("review-text")])],
  emptyChildren: [el("reviews-empty")],
});

/** The shape Chefs Depot's stored `product-tabs` master carries: a Reviews tab
 *  panel whose only child repeats `reviews.list` and prints title + body. */
const cdTabs = (): NodeTree => ({
  v: 1,
  root: el("tabs-root", [
    el("tabstrip"),
    el("panel-description"),
    el("panel-reviews-x69", [reviewsRepeat("reviews-repeat-x70")]),
    el("panel-downloads"),
  ]),
});

const nodes = (node: BuilderNode): BuilderNode[] => {
  const kids =
    node.kind === "element"
      ? (node.children ?? [])
      : node.kind === "repeat"
        ? [...(node.children ?? []), ...(node.emptyChildren ?? [])]
        : [];
  return [node, ...kids.flatMap(nodes)];
};
const ids = (node: BuilderNode): string[] => nodes(node).map((n) => n.id);
const count = (tree: NodeTree, id: string) => ids(tree.root).filter((x) => x === id).length;

test("the title+body repeat is REPLACED by the sealed leaf, in place", () => {
  const out = withReviewsBlock(cdTabs());
  assert.equal(count(out, PRODUCT_REVIEWS_NODE_ID), 1);
  // The repeat and everything it printed are gone — the leaf renders the list.
  assert.ok(!ids(out.root).includes("reviews-repeat-x70"));
  assert.ok(!ids(out.root).includes("review-title"));
  // And it sits inside the Reviews PANEL, so the tab condition still gates it.
  const panel = nodes(out.root).find((n) => n.id === "panel-reviews-x69");
  assert.ok(panel && panel.kind === "element");
  assert.deepEqual(
    (panel.kind === "element" ? (panel.children ?? []) : []).map((c) => c.id),
    [PRODUCT_REVIEWS_NODE_ID]
  );
});

test("the native key is NOT `product-reviews` — Industry Kitchens owns that master", () => {
  assert.notEqual(PRODUCT_REVIEWS_NODE_ID, "product-reviews");
  const out = withReviewsBlock(cdTabs());
  const leaf = nodes(out.root).find((n) => n.id === PRODUCT_REVIEWS_NODE_ID);
  assert.ok(leaf && leaf.kind === "component");
  assert.equal(leaf.kind === "component" ? leaf.componentKey : null, PRODUCT_REVIEWS_NODE_ID);
});

/** Industry Kitchens' authored `product-reviews` master: a heading, stars per
 *  review, and its own Write a Review form wired to the submitReview action. */
const ikMaster = (): NodeTree => ({
  v: 1,
  root: el("reviews-root", [
    el("reviews-heading"),
    reviewsRepeat("ik-repeat"),
    el("form-wrap", [
      {
        id: "ik-form",
        kind: "element",
        tag: "form",
        events: [{ on: "submit", action: { kind: "action", ref: "submitReview" } }],
        children: [el("ik-name"), el("ik-title-optional")],
      },
    ]),
  ]),
});

test("an AUTHORED form is replaced too — one implementation on both sites", () => {
  // Leaving it would mean IK asks for different fields from Chefs Depot AND
  // calls the title optional while the action requires one.
  const out = withReviewsBlock(ikMaster());
  assert.equal(count(out, PRODUCT_REVIEWS_NODE_ID), 1);
  assert.ok(!ids(out.root).includes("ik-form"), "the authored form is gone");
  assert.ok(!ids(out.root).includes("ik-title-optional"));
  assert.ok(!ids(out.root).includes("ik-repeat"));
  // Everything that was not the review block survives.
  assert.ok(ids(out.root).includes("reviews-heading"));
  // And exactly ONE form remains on the screen, the sealed one.
  assert.equal(nodes(out.root).filter((n) => n.kind === "element" && n.tag === "form").length, 0);
});

test("a stray submit form with no review list is NOT deleted", () => {
  // Nothing anchors the swap, so nothing may be removed — a tree we do not
  // understand is left exactly as the author wrote it.
  const strayForm: NodeTree = {
    v: 1,
    root: el("root", [
      {
        id: "some-form",
        kind: "element",
        tag: "form",
        events: [{ on: "submit", action: { kind: "action", ref: "submitReview" } }],
        children: [],
      },
    ]),
  };
  assert.equal(withReviewsBlock(strayForm), strayForm);
});

test("idempotent over the IK shape as well", () => {
  const once = withReviewsBlock(ikMaster());
  assert.equal(withReviewsBlock(once), once);
});

test("idempotent: a second pass changes nothing", () => {
  const once = withReviewsBlock(cdTabs());
  const twice = withReviewsBlock(once);
  assert.equal(twice, once);
  assert.equal(count(twice, PRODUCT_REVIEWS_NODE_ID), 1);
});

test("an author who placed the leaf themselves keeps their placement", () => {
  const authored: NodeTree = {
    v: 1,
    root: el("root", [
      el("somewhere-else", [
        { id: PRODUCT_REVIEWS_NODE_ID, kind: "component", componentKey: PRODUCT_REVIEWS_NODE_ID },
      ]),
      el("panel-reviews", [reviewsRepeat()]),
    ]),
  };
  const out = withReviewsBlock(authored);
  assert.equal(out, authored);
  assert.equal(count(out, PRODUCT_REVIEWS_NODE_ID), 1);
});

test("a tree with no reviews repeat is returned untouched", () => {
  const plain: NodeTree = { v: 1, root: el("root", [el("a"), el("b")]) };
  assert.equal(withReviewsBlock(plain), plain);
});

test("the walk never descends into a repeat — a per-row reviews strip is not the panel", () => {
  // A related-products rail repeats product cards; a card that listed reviews
  // would be ONE item subtree, not this page's review panel. Rebuilding inside
  // a repeat is the failure that once lost the SilverChef panel site-wide.
  const railOnly: NodeTree = {
    v: 1,
    root: el("root", [
      {
        id: "related-rail",
        kind: "repeat",
        source: "related.products",
        itemAlias: "row",
        children: [el("card", [reviewsRepeat("card-reviews")])],
      },
    ]),
  };
  assert.equal(withReviewsBlock(railOnly), railOnly);
});

test("whitespace in the authored binding still matches", () => {
  const spaced: NodeTree = {
    v: 1,
    root: el("root", [el("panel", [reviewsRepeat("r", " reviews.list ")])]),
  };
  assert.equal(count(withReviewsBlock(spaced), PRODUCT_REVIEWS_NODE_ID), 1);
});

test("a DIFFERENT collection is not mistaken for the review list", () => {
  const other: NodeTree = {
    v: 1,
    root: el("root", [el("panel", [reviewsRepeat("r", "attachments")])]),
  };
  assert.equal(withReviewsBlock(other), other);
});

test("the component library gets the same pass, and non-trees survive it", () => {
  const out = withReviewsBlockInComponents({
    "product-tabs": cdTabs(),
    "price-panel": { v: 1, root: el("price") } as NodeTree,
    broken: null as unknown as NodeTree,
  });
  assert.equal(count(out["product-tabs"], PRODUCT_REVIEWS_NODE_ID), 1);
  assert.equal(count(out["price-panel"], PRODUCT_REVIEWS_NODE_ID), 0);
  assert.equal(out.broken, null);
});
