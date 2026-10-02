import { test } from "node:test";
import assert from "node:assert/strict";
import type { NodeTree, BuilderNode } from "@keenan/services/builder";
import { composeProductPlacements, placementPassRuns, templateOwnedPlacements, TEMPLATE_OWNS_ATTR } from "./product-placements.ts";
import { withSilverChefNode } from "./silverchef-node.ts";
import { withItemIdNode } from "./item-id-node.ts";
import { withAddonsNode } from "./product-addons-node.ts";
import { withProductKitNode } from "./product-kit-node.ts";
import { withProductInstructionsNode } from "./product-instructions-node.ts";
import { withImageNoticeNode } from "./product-image-notice.ts";
import { withCombinationNoticeNode } from "./product-combination-notice.ts";
import { withReviewsBlock } from "./product-reviews-node.ts";
import { withResidentialNoticeNode } from "./product-residential-notice.ts";
import { withPackNoteNode } from "./product-pack-note.ts";
import { withModularNoticeNode } from "./modular-notice.ts";
import { withUpsellBlock } from "./upsell-node.ts";
import { withCdMemberPricingNode } from "./cd-member-pricing-node.ts";

// A product tree shaped like the live ones around the buy box: gallery, SKU line,
// short description, price panel, option picker, buy row, related rail.
function tree(extra: BuilderNode[] = [], owns?: string): NodeTree {
  return {
    v: 1,
    root: {
      id: "root",
      kind: "element",
      tag: "div",
      classes: ["mx-auto", "max-w-7xl"],
      ...(owns === undefined ? {} : { attrs: { [TEMPLATE_OWNS_ATTR]: { kind: "static" as const, value: owns } } }),
      children: [
        {
          id: "grid",
          kind: "element",
          tag: "div",
          children: [
            { id: "gallery", kind: "component", componentKey: "product-gallery" },
            {
              id: "details",
              kind: "element",
              tag: "div",
              children: [
                {
                  id: "sku",
                  kind: "element",
                  tag: "p",
                  children: [
                    { id: "sku-prefix", kind: "element", tag: "span", text: [{ kind: "static", value: "SKU: " }] },
                    { id: "sku-value", kind: "element", tag: "span", text: [{ kind: "binding", path: "product.sku" }] },
                  ],
                },
                { id: "desc", kind: "element", tag: "div", richBinding: "product.descriptionShort" },
                { id: "price", kind: "component", componentKey: "price-panel" },
                { id: "opts", kind: "component", componentKey: "option-selector" },
                ...extra,
                { id: "actions", kind: "component", componentKey: "actions-row" },
              ],
            },
          ],
        },
        {
          id: "related",
          kind: "element",
          tag: "div",
          children: [
            { id: "related-h", kind: "element", tag: "h2", text: [{ kind: "static", value: "Related Products" }] },
            {
              id: "related-grid",
              kind: "element",
              tag: "div",
              children: [
                {
                  id: "related-repeat",
                  kind: "repeat",
                  source: "related.products",
                  itemAlias: "card",
                  children: [{ id: "card", kind: "component", componentKey: "product-card" }],
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

/** The nested calls `product-node-branch.tsx` made before this module existed. */
function legacyChain(t: NodeTree): NodeTree {
  return withCdMemberPricingNode(
    withUpsellBlock(
      withCombinationNoticeNode(
        withResidentialNoticeNode(
          withAddonsNode(
            withProductInstructionsNode(
              withProductKitNode(
                withPackNoteNode(withModularNoticeNode(withReviewsBlock(withImageNoticeNode(withSilverChefNode(withItemIdNode(t))))))
              )
            )
          )
        )
      )
    )
  );
}

function ids(node: BuilderNode, out: string[] = []): string[] {
  out.push(node.id);
  if (node.kind === "element") for (const c of node.children ?? []) ids(c, out);
  if (node.kind === "repeat") for (const c of [...(node.children ?? []), ...(node.emptyChildren ?? [])]) ids(c, out);
  return out;
}

// What Industry Kitchens' page-69 template declares.
const IK = "item-id image-notice residential-notice pack-note kit instructions addons combination-notice upsell-rail compare";

test("a tree that declares nothing gets exactly the tree the nested calls produced (Chefs Depot, seed)", () => {
  const t = tree();
  assert.deepEqual(composeProductPlacements(t), legacyChain(t));
});

test("a declared placement is never re-inserted — deleting the node in the CMS deletes it", () => {
  const out = composeProductPlacements(tree([], IK));
  const got = ids(out.root);
  for (const id of [
    "item-id-line",
    "product-image-notice",
    "product-residential-notice",
    "product-pack-note",
    "product-kit",
    "product-instructions",
    "product-addons",
    "product-combination-notice",
  ]) {
    assert.ok(!got.includes(id), `${id} must not be placed`);
  }
  // Placements the template does NOT declare still arrive (SilverChef panel, CD pricing leaf).
  assert.ok(got.includes("silverchef-panel"));
  assert.ok(got.includes("cd-member-pricing"));
});

test("an authored node stays exactly where and how the author put it", () => {
  const authored: BuilderNode = {
    id: "product-addons",
    kind: "component",
    componentKey: "product-addons",
    condition: { kind: "expr", source: "!product.isZoeyOutOfStock && purchase.addonsPanelShown" },
  };
  const out = composeProductPlacements(tree([authored], IK));
  const grid = (out.root as { children: BuilderNode[] }).children[0] as { children: BuilderNode[] };
  const kids = (grid.children[1] as { children: BuilderNode[] }).children;
  const i = kids.findIndex((k) => k.id === "product-addons");
  assert.equal(kids[i], authored);
  assert.equal(kids[i + 1].id, "actions");
  assert.equal(ids(out.root).filter((id) => id === "product-addons").length, 1);
});

test("the declaration is read strictly: static value, known names only, spaces or commas", () => {
  assert.deepEqual([...templateOwnedPlacements(tree([], "addons, kit  bogus"))].sort(), ["addons", "kit"]);
  assert.equal(templateOwnedPlacements(tree([], "")).size, 0);
  assert.equal(templateOwnedPlacements(tree()).size, 0);
  assert.equal(templateOwnedPlacements(null).size, 0);
  const bound: NodeTree = {
    v: 1,
    root: { id: "r", kind: "element", tag: "div", attrs: { [TEMPLATE_OWNS_ATTR]: { kind: "binding", path: "x" } } },
  };
  assert.equal(templateOwnedPlacements(bound).size, 0);
  // An unknown name switches nothing off.
  const t = tree([], "bogus");
  assert.deepEqual(composeProductPlacements(t), legacyChain(t));
});

test("placementPassRuns answers for the compare pass the branch runs later", () => {
  assert.equal(placementPassRuns(tree([], IK), "compare"), false);
  assert.equal(placementPassRuns(tree([], "addons"), "compare"), true);
  assert.equal(placementPassRuns(tree(), "compare"), true);
});
