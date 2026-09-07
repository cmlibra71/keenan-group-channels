import { test } from "node:test";
import assert from "node:assert/strict";
import type { NodeTree, BuilderNode } from "@keenan/services/builder";
import {
  withModularNoticeNode,
  slugIsModularSystems,
  MODULAR_NOTICE_NODE_ID,
  MODULAR_NOTICE_TEXT,
} from "./modular-notice";

// ============================================================================
// Card qGfWAzQx. The banner node below is the LIVE Chefs Depot published
// product template (channel 2, page 71 / version 207) as read from production
// on 2026-09-07 — id, label, classes, condition and the double space in the
// middle of the sentence all copied verbatim, so these tests fail if the shape
// this pass matches on ever stops being the shape that is really stored.
// ============================================================================

const liveBanner: BuilderNode = {
  id: "p-mt9m4pkf-k2y7k",
  tag: "p",
  kind: "element",
  label: "new-banner",
  text: [
    { kind: "static", value: "IMAGES ARE FOR ILLUSTRATIVE PURPOSES ONLY.  REFER TO SPEC SHEETS\n" },
  ],
  classes: [
    "text-sm",
    "lg:font-[Arial,_sans-serif]",
    "lg:text-sale",
    "lg:bg-steel-100",
    "lg:text-2xl",
    "lg:text-center",
    "lg:pt-[20px]",
    "lg:mt-[20px]",
    "lg:pb-[20px]",
  ],
  condition: { kind: "expr", source: '"modular-systems" in product.slug' },
};

/** The live Chefs Depot buy column: the banner sits in its own flex row. */
function cdTree(banner: BuilderNode = liveBanner): NodeTree {
  return {
    v: 1,
    root: {
      id: "pdp-root",
      kind: "element",
      tag: "div",
      children: [
        { id: "crumbs-wrap", kind: "element", tag: "div", classes: ["mx-auto", "max-w-7xl"], children: [] },
        {
          id: "overview-wrap",
          kind: "element",
          tag: "div",
          classes: ["mx-auto", "max-w-7xl"],
          children: [
            {
              id: "overview-grid",
              kind: "element",
              tag: "div",
              children: [
                { id: "gallery", kind: "component", componentKey: "product-gallery" },
                {
                  id: "buy-col",
                  kind: "element",
                  tag: "div",
                  children: [
                    { id: "actions-row", kind: "component", componentKey: "actions-row" },
                    {
                      id: "row-mt9m4glq-ar0pn",
                      kind: "element",
                      tag: "div",
                      classes: ["flex", "flex-row", "items-center", "gap-4"],
                      children: [banner],
                    },
                    { id: "trust-row", kind: "element", tag: "div", children: [] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

function find(node: BuilderNode, id: string): BuilderNode | null {
  if (node.id === id) return node;
  const kids =
    node.kind === "element"
      ? (node.children ?? [])
      : node.kind === "repeat"
        ? [...(node.children ?? []), ...(node.emptyChildren ?? [])]
        : [];
  for (const child of kids) {
    const hit = find(child, id);
    if (hit) return hit;
  }
  return null;
}

function countLeaves(node: BuilderNode): number {
  const self = node.kind === "component" && node.componentKey === MODULAR_NOTICE_NODE_ID ? 1 : 0;
  const kids =
    node.kind === "element"
      ? (node.children ?? [])
      : node.kind === "repeat"
        ? [...(node.children ?? []), ...(node.emptyChildren ?? [])]
        : [];
  return self + kids.reduce((n, child) => n + countLeaves(child), 0);
}

// ── The rule the card states ────────────────────────────────────────────────

test("the rule matches a Modular Systems slug however the phrase is written", () => {
  for (const slug of [
    "modular-systems-dsc-1800l-h-kitchen-tidy-cabinet-with-double-left-sinks",
    "fed-wbb6-sbl-modular-systems-splashback-extension-for-premium-600-series-bench",
    "MODULAR-SYSTEMS-S-604030-POT-SINK",
    "modular systems s-604030 pot sink",
    // The SAME range, slugged singular on 157 live products — see the rule's note.
    "modular-system-swbd10-1200-workbench-with-3-drawer-each-side",
    "modular-system-sus6-1500a-solid-undershelf-for-premium-range",
    "modular-system-lb7-0600a-leg-brace-for-premium-range",
  ]) {
    assert.equal(slugIsModularSystems(slug), true, slug);
  }
});

test("the rule does NOT match combi ovens, including the modular combi stands", () => {
  for (const slug of [
    // The only two live slugs carrying "modular" AND "combi" (production, 2026-09-07).
    "rational-icp-ug1-102-modular-stand-no-runners-suits-6-21-10-21-combi-ovens",
    "rational-icp-ug2-102-modular-stand-with-runners-suits-6-21-10-21-combi-ovens",
    "unox-xeda-1011-exrs-et-cheftop-x-10-trays-gn-11-combi-oven",
    "turbofan-ec40t7-full-size-7-tray-touch-electric-combi-oven",
    // Neither half of the phrase on its own is enough.
    "some-modular-bench",
    "brand-systems-trolley",
    // The words have to be adjacent, not merely both present.
    "modular-coolroom-panel-systems",
  ]) {
    assert.equal(slugIsModularSystems(slug), false, slug);
  }
});

test("the rule is safe on a missing or non-string slug", () => {
  assert.equal(slugIsModularSystems(undefined), false);
  assert.equal(slugIsModularSystems(null), false);
  assert.equal(slugIsModularSystems(""), false);
  assert.equal(slugIsModularSystems(42), false);
});

// ── The pass over the stored tree ───────────────────────────────────────────

test("the half-finished banner is replaced, in place, by the sealed leaf", () => {
  const out = withModularNoticeNode(cdTree());
  const row = find(out.root, "row-mt9m4glq-ar0pn");
  assert.ok(row && row.kind === "element");
  assert.equal(row.children?.length, 1);
  const leaf = row.children![0];
  assert.equal(leaf.kind, "component");
  assert.equal((leaf as { componentKey: string }).componentKey, MODULAR_NOTICE_NODE_ID);
  // The unstyled paragraph is gone, so a phone cannot get the raw sentence.
  assert.equal(find(out.root, "p-mt9m4pkf-k2y7k"), null);
  assert.equal(countLeaves(out.root), 1);
});

test("the pass is pure — the caller's stored tree is never mutated", () => {
  const before = cdTree();
  const snapshot = JSON.stringify(before);
  withModularNoticeNode(before);
  assert.equal(JSON.stringify(before), snapshot);
});

test("running it twice changes nothing and re-uses the same tree object", () => {
  const once = withModularNoticeNode(cdTree());
  const twice = withModularNoticeNode(once);
  assert.equal(twice, once);
  assert.equal(countLeaves(twice.root), 1);
});

test("a tree with no half-finished banner is returned untouched", () => {
  const plain: NodeTree = {
    v: 1,
    root: { id: "root", kind: "element", tag: "div", children: [{ id: "gallery", kind: "component", componentKey: "product-gallery" }] },
  };
  assert.equal(withModularNoticeNode(plain), plain);
});

test("the per-product image notice (82HgV23q) is NOT swallowed — it carries no modular condition", () => {
  const ticked: BuilderNode = {
    id: "product-image-notice",
    kind: "component",
    componentKey: "product-image-notice",
  };
  const tree: NodeTree = {
    v: 1,
    root: { id: "root", kind: "element", tag: "div", children: [ticked] },
  };
  assert.equal(withModularNoticeNode(tree), tree);
});

test("a paragraph carrying the sentence but NO modular condition is left alone", () => {
  const tree = cdTree({ ...liveBanner, condition: undefined });
  assert.equal(withModularNoticeNode(tree), tree);
});

test("a node whose condition is modular but whose words are not is left alone", () => {
  const tree = cdTree({
    ...liveBanner,
    text: [{ kind: "static", value: "Built to order" }],
  });
  assert.equal(withModularNoticeNode(tree), tree);
});

test("the banner never renders inside a repeat's item subtree", () => {
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
          children: [{ id: "card", kind: "element", tag: "div", children: [] }],
        },
        liveBanner,
      ],
    },
  };
  const out = withModularNoticeNode(tree);
  assert.equal(countLeaves(out.root), 1);
  const related = find(out.root, "related");
  assert.equal(related?.kind, "repeat");
  assert.equal(countLeaves(related!), 0);
});

test("the copy is exactly the sentence the card supplied", () => {
  assert.equal(MODULAR_NOTICE_TEXT, "Images are for illustrative purposes only. Refer to spec sheets.");
});
