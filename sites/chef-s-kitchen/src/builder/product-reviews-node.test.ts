import { test } from "node:test";
import assert from "node:assert/strict";
import type { BuilderNode, NodeTree } from "@keenan/services/builder";
import {
  PRODUCT_REVIEWS_NODE_ID,
  withReviewsBlock,
  withReviewsBlockInComponents,
} from "./product-reviews-node.ts";

// ============================================================================
// The two fixtures below are the PUBLISHED PRODUCTION SHAPES, read off
// `cms_components` (`channel_id`, `key`) on 2026-09-16 — not shapes invented
// here. The first cut of this card was rejected because its Industry Kitchens
// fixture was hand-written without the `reviews.list[0]` wrapper the real
// master has, so the test asserted the bug was correct and the form vanished
// from every IK product with no approved review.
//
// Repeated markup (the ten star svgs per review, the five star-picker buttons,
// the per-field error paragraphs) is elided. Every id, every CONDITION, every
// event and the NESTING are verbatim — those are the whole subject of the pass.
// ============================================================================

const el = (
  id: string,
  children: BuilderNode[] = [],
  extra: Partial<BuilderNode> = {}
): BuilderNode =>
  ({
    id,
    kind: "element",
    tag: "div",
    children,
    ...extra,
  }) as BuilderNode;

const reviewsRepeat = (id = "reviews-repeat", source = "reviews.list"): BuilderNode => ({
  id,
  kind: "repeat",
  source,
  itemAlias: "review",
  children: [el("review-card", [el("review-title"), el("review-text")])],
  emptyChildren: [el("reviews-empty")],
});

/**
 * PRODUCTION, channel 2 (Chefs Depot), `cms_components` key `product-tabs`.
 * The Reviews tab panel is gated on the TAB index and its only child is the
 * `reviews.list` repeat, which prints a title and a body.
 */
const cdTabs = (): NodeTree => ({
  v: 1,
  root: el("n-ms-tabs-root", [
    el("tabstrip-x50"),
    el("panel-description-x60", [], {
      condition: { kind: "state", ref: "tab", equals: 0 },
    }),
    el("panel-reviews-x69", [reviewsRepeat("reviews-repeat-x70")], {
      condition: { kind: "state", ref: "tab", equals: 3 },
    }),
    el("panel-download-x74"),
  ]),
});

/**
 * PRODUCTION, channel 1 (Industry Kitchens), `cms_components` key
 * `product-reviews` — the MASTER the `product-tabs` master places as a
 * component instance. FOUR siblings under one wrapper, and the list is behind
 * `reviews.list[0]`, which is exactly what a naive in-place substitution
 * inherits.
 */
const ikMaster = (): NodeTree => ({
  v: 1,
  root: el(
    "n-mshatcsv-d9wyv",
    [
      el("n-mshatcsv-i3xwv", [reviewsRepeat("n-mshatcsv-8grt6")], {
        label: "review-list",
        condition: { kind: "expr", source: "reviews.list[0]" },
      }),
      el("n-mshatcsv-5sxmp", [], {
        tag: "p",
        label: "list-empty",
        condition: { kind: "expr", source: "!reviews.list[0]" },
        text: [{ kind: "static", value: "Be the first to review this product!" }],
      }),
      el("n-mshatcsv-nazol", [], {
        label: "submitted",
        condition: { kind: "state", ref: "submit.ok" },
        text: [
          { kind: "static", value: "Thank you for your review! It will appear after approval." },
        ],
      }),
      el(
        "n-mshatcsv-y487d",
        [
          el("n-mshatcsv-sr1e7", [], {
            tag: "h3",
            text: [{ kind: "static", value: "Write a Review" }],
          }),
          el(
            "n-mshatcsv-t97aq",
            [
              el("n-mshatcsv-yb0kb", [el("n-mshatcsv-sc4uo"), el("n-mshatcsv-29o5g")]),
              el("n-mshatcsv-aro8f", [el("n-mshatcsv-xv0sm"), el("n-mshatcsv-e5lj6")]),
              el("n-mshatcsv-1cuij", [el("n-mshatcsv-4ug2h"), el("n-mshatcsv-kuvi6")]),
              el("n-mshatcsv-n4qnf", [el("n-mshatcsv-fskoq"), el("n-mshatcsv-cvkbm")]),
              el("n-mshatcsv-e26bq", [], { tag: "button" }),
            ],
            {
              tag: "form",
              events: [
                {
                  on: "submit",
                  action: {
                    kind: "action",
                    ref: "submitReview",
                    status: "submit",
                    args: {
                      form: { kind: "binding", path: "@form" },
                      productId: { kind: "binding", path: "product.id" },
                    },
                  },
                },
              ],
            }
          ),
        ],
        {
          label: "write-review",
          condition: { kind: "state", ref: "submit.ok", not: true },
        }
      ),
    ],
    {
      label: "product-reviews",
      state: [
        { name: "rating", type: "index", initial: 0 },
        { name: "hover", type: "index", initial: 0 },
        { name: "submit", type: "action" },
      ],
    }
  ),
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

/** Every condition standing between the root and `id`, the leaf's own included. */
function gatesOver(root: BuilderNode, id: string): unknown[] {
  const found: unknown[] = [];
  const walk = (node: BuilderNode, stack: unknown[]): boolean => {
    const here = node.condition ? [...stack, node.condition] : stack;
    if (node.id === id) {
      found.push(...here);
      return true;
    }
    const kids =
      node.kind === "element"
        ? (node.children ?? [])
        : node.kind === "repeat"
          ? [...(node.children ?? []), ...(node.emptyChildren ?? [])]
          : [];
    return kids.some((child) => walk(child, here));
  };
  walk(root, []);
  return found;
}

const conditionText = (node: BuilderNode): string => JSON.stringify(node.condition ?? null);

/** A node's inline text, whatever kind of node it is (a repeat carries none). */
const textOf = (node: BuilderNode): string =>
  JSON.stringify((node as { text?: unknown }).text ?? null);

// ── Chefs Depot ─────────────────────────────────────────────────────────────

test("CD: the title+body repeat is REPLACED by the sealed leaf, inside the tab panel", () => {
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
  // The tab gate is the tab strip's, not the review list's — it must survive.
  assert.deepEqual(gatesOver(out.root, PRODUCT_REVIEWS_NODE_ID), [
    { kind: "state", ref: "tab", equals: 3 },
  ]);
  // Nothing else on the master was touched.
  assert.ok(ids(out.root).includes("panel-description-x60"));
  assert.ok(ids(out.root).includes("panel-download-x74"));
});

// ── Industry Kitchens ───────────────────────────────────────────────────────

test("IK: the leaf is UNGATED — a product with no approved review still gets the panel", () => {
  // The regression this card was rejected for. `#i3xwv` carries
  // `cond: reviews.list[0]`, so a leaf substituted inside it renders on exactly
  // one product in the IK catalogue.
  const out = withReviewsBlock(ikMaster());
  assert.equal(count(out, PRODUCT_REVIEWS_NODE_ID), 1);
  assert.deepEqual(gatesOver(out.root, PRODUCT_REVIEWS_NODE_ID), []);
  // And nothing anywhere in the output is still gated on the review list.
  assert.deepEqual(
    nodes(out.root).filter((n) => conditionText(n).includes("reviews.list")),
    []
  );
});

test("IK: the whole authored block goes — one Write a Review heading, not two", () => {
  const out = withReviewsBlock(ikMaster());
  const surviving = ids(out.root);
  // The gated list wrapper, the authored empty state, the thank-you panel and
  // the form wrapper all belonged to the block the leaf replaces.
  for (const gone of [
    "n-mshatcsv-i3xwv",
    "n-mshatcsv-8grt6",
    "n-mshatcsv-5sxmp",
    "n-mshatcsv-nazol",
    "n-mshatcsv-y487d",
    "n-mshatcsv-sr1e7",
    "n-mshatcsv-t97aq",
    "n-mshatcsv-e26bq",
  ]) {
    assert.ok(!surviving.includes(gone), `${gone} should not survive`);
  }
  // No orphan heading: the sealed leaf carries the only "Write a Review" on the
  // screen, so the authored tree must contribute none.
  const headings = nodes(out.root).filter((n) => textOf(n).includes("Write a Review"));
  assert.equal(headings.length, 0);
  // No authored empty state either — the leaf prints Zoey's sentence itself,
  // without the exclamation mark, and two empty states would contradict.
  assert.equal(
    nodes(out.root).filter((n) => textOf(n).includes("Be the first to review this product")).length,
    0
  );
  // Exactly ONE form on the page, the sealed one — the tree contributes none.
  assert.equal(nodes(out.root).filter((n) => n.kind === "element" && n.tag === "form").length, 0);
  // The block wrapper itself survives and now holds the leaf and nothing else.
  assert.deepEqual(
    (out.root.kind === "element" ? (out.root.children ?? []) : []).map((c) => c.id),
    [PRODUCT_REVIEWS_NODE_ID]
  );
});

test("IK: idempotent over the real shape", () => {
  const once = withReviewsBlock(ikMaster());
  assert.equal(withReviewsBlock(once), once);
});

// ── Guards ──────────────────────────────────────────────────────────────────

test("the native key is NOT `product-reviews` — Industry Kitchens owns that master", () => {
  assert.notEqual(PRODUCT_REVIEWS_NODE_ID, "product-reviews");
  const out = withReviewsBlock(cdTabs());
  const leaf = nodes(out.root).find((n) => n.id === PRODUCT_REVIEWS_NODE_ID);
  assert.ok(leaf && leaf.kind === "component");
  assert.equal(leaf.kind === "component" ? leaf.componentKey : null, PRODUCT_REVIEWS_NODE_ID);
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

test("a form authored FAR from the list is still dropped — one form per page", () => {
  const split: NodeTree = {
    v: 1,
    root: el("root", [
      el("left", [el("panel", [reviewsRepeat("r")])]),
      el("right", [
        {
          id: "far-form",
          kind: "element",
          tag: "form",
          events: [{ on: "submit", action: { kind: "action", ref: "submitReview" } }],
          children: [],
        },
      ]),
    ]),
  };
  const out = withReviewsBlock(split);
  assert.equal(count(out, PRODUCT_REVIEWS_NODE_ID), 1);
  assert.ok(!ids(out.root).includes("far-form"));
  // The unrelated wrapper survives — only the form itself is swept.
  assert.ok(ids(out.root).includes("right"));
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

test("a sibling that is NOT part of the block survives the swap", () => {
  // Only the review list's own gate, the form's status gates and the form are
  // swept. A heading or a promo beside them is the author's and stays.
  const withNeighbours: NodeTree = {
    v: 1,
    root: el("root", [
      el("section-heading"),
      el("gated-list", [reviewsRepeat("r")], {
        condition: { kind: "expr", source: "reviews.list[0]" },
      }),
      el("unrelated-promo"),
    ]),
  };
  const out = withReviewsBlock(withNeighbours);
  assert.deepEqual(
    (out.root.kind === "element" ? (out.root.children ?? []) : []).map((c) => c.id),
    ["section-heading", PRODUCT_REVIEWS_NODE_ID, "unrelated-promo"]
  );
});

test("the gated block can be the whole tree — the leaf still renders ungated", () => {
  const rootGated: NodeTree = {
    v: 1,
    root: el("root", [reviewsRepeat("r")], {
      condition: { kind: "expr", source: "reviews.list[0]" },
    }),
  };
  const out = withReviewsBlock(rootGated);
  assert.equal(count(out, PRODUCT_REVIEWS_NODE_ID), 1);
  assert.equal(out.root.condition, undefined);
  assert.deepEqual(gatesOver(out.root, PRODUCT_REVIEWS_NODE_ID), []);
});

test("the component library gets the same pass, and non-trees survive it", () => {
  const out = withReviewsBlockInComponents({
    "product-tabs": cdTabs(),
    "product-reviews": ikMaster(),
    "price-panel": { v: 1, root: el("price") } as NodeTree,
    broken: null as unknown as NodeTree,
  });
  assert.equal(count(out["product-tabs"], PRODUCT_REVIEWS_NODE_ID), 1);
  assert.equal(count(out["product-reviews"], PRODUCT_REVIEWS_NODE_ID), 1);
  assert.deepEqual(gatesOver(out["product-reviews"].root, PRODUCT_REVIEWS_NODE_ID), []);
  assert.equal(count(out["price-panel"], PRODUCT_REVIEWS_NODE_ID), 0);
  assert.equal(out.broken, null);
});
