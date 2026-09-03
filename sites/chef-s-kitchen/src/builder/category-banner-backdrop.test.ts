import test from "node:test";
import assert from "node:assert/strict";
import type { NodeTree } from "@keenan/services/builder";
import {
  stripCategoryBannerBackdrop,
  findBannerBackdropNodes,
  BANNER_BACKDROP_NODE_IDS,
} from "./category-banner-backdrop";

/**
 * A miniature of Chefs Depot's published `category_layout` tree (cms_pages row
 * 72), copied field-for-field from production on 2026-09-03: the banner section
 * with the stretched feature image, its scrim, and the content block that must
 * survive untouched.
 */
function cdCategoryTree(): NodeTree {
  return {
    v: 1,
    root: {
      id: "div-seed-24",
      kind: "element",
      tag: "div",
      label: "category-page",
      classes: [],
      children: [
        {
          id: "section-seed-11",
          kind: "element",
          tag: "section",
          label: "banner",
          classes: ["relative", "overflow-hidden", "bg-gradient-to-br", "from-brand-mid", "to-brand-deep"],
          children: [
            {
              id: "img-cf1",
              kind: "element",
              tag: "img",
              label: "banner-bg",
              classes: ["object-cover", "opacity-30", "absolute", "inset-0", "h-full", "w-full"],
              attrs: {
                alt: { kind: "static", value: "" },
                src: { kind: "binding", path: "category.image_url" },
              },
              condition: { kind: "expr", source: "category.image_url" },
            },
            {
              id: "div-cf2",
              kind: "element",
              tag: "div",
              label: "banner-overlay",
              classes: ["absolute", "inset-0", "bg-gradient-to-r", "from-brand-deep/80", "to-brand-deep/40"],
              condition: { kind: "expr", source: "category.image_url" },
            },
            {
              id: "div-seed-10",
              kind: "element",
              tag: "div",
              classes: ["container-page", "relative", "py-10", "lg:py-12"],
              children: [
                { id: "nav-seed-1", kind: "element", tag: "nav", label: "breadcrumbs", children: [] },
                {
                  id: "h1-seed-2",
                  kind: "element",
                  tag: "h1",
                  classes: ["heading-serif", "text-3xl", "text-white", "sm:text-4xl"],
                  text: [{ kind: "binding", path: "category.name" }],
                },
                {
                  id: "div-seed-3",
                  kind: "element",
                  tag: "div",
                  label: "description",
                  richBinding: "category.description",
                },
                { id: "span-seed-4", kind: "element", tag: "span", label: "count-pill", children: [] },
              ],
            },
          ],
        },
        {
          id: "div-seed-25",
          kind: "element",
          tag: "div",
          label: "listing-area",
          children: [
            // The subcategory tiles bind the SAME field for a real, in-flow
            // picture. Card TnQJpunl removes the banner backdrop only, and
            // sibling MN702iBv owns these — they must survive byte for byte.
            {
              id: "sub-tile-img",
              kind: "element",
              tag: "img",
              label: "subcategory-thumb",
              classes: ["rounded", "object-cover", "h-12", "w-12"],
              attrs: { src: { kind: "binding", path: "category.image_url" } },
            },
          ],
        },
      ],
    },
  } as unknown as NodeTree;
}

/** Industry Kitchens' tree: authored clean, no backdrop, verified on prod. */
function ikCategoryTree(): NodeTree {
  return {
    v: 1,
    root: {
      id: "div-ik-root",
      kind: "element",
      tag: "div",
      children: [
        {
          id: "section-ik-banner",
          kind: "element",
          tag: "section",
          label: "banner",
          classes: ["relative", "overflow-hidden"],
          children: [
            { id: "h1-ik", kind: "element", tag: "h1", text: [{ kind: "binding", path: "category.name" }] },
          ],
        },
      ],
    },
  } as unknown as NodeTree;
}

function ids(tree: NodeTree): string[] {
  const out: string[] = [];
  const visit = (n: Record<string, unknown>) => {
    if (typeof n.id === "string") out.push(n.id);
    const kids = n.children;
    if (Array.isArray(kids)) for (const k of kids as Record<string, unknown>[]) visit(k);
  };
  visit(tree.root as unknown as Record<string, unknown>);
  return out;
}

test("drops the stretched feature image and its scrim from the banner", () => {
  const { tree, removed } = stripCategoryBannerBackdrop(cdCategoryTree());
  assert.deepEqual(removed, [...BANNER_BACKDROP_NODE_IDS]);
  const remaining = ids(tree);
  assert.ok(!remaining.includes("img-cf1"), "banner-bg image still present");
  assert.ok(!remaining.includes("div-cf2"), "banner-overlay scrim still present");
});

test("the green banner and everything written on it survives", () => {
  const { tree } = stripCategoryBannerBackdrop(cdCategoryTree());
  const remaining = ids(tree);
  for (const id of ["section-seed-11", "div-seed-10", "nav-seed-1", "h1-seed-2", "div-seed-3", "span-seed-4"]) {
    assert.ok(remaining.includes(id), `${id} was removed and should not have been`);
  }
  // The gradient that IS the brand green is untouched.
  const banner = (tree.root as unknown as { children: { classes: string[] }[] }).children[0];
  assert.deepEqual(banner.classes, [
    "relative",
    "overflow-hidden",
    "bg-gradient-to-br",
    "from-brand-mid",
    "to-brand-deep",
  ]);
});

test("the subcategory tile's use of the same feature image is left alone", () => {
  const { tree } = stripCategoryBannerBackdrop(cdCategoryTree());
  assert.ok(ids(tree).includes("sub-tile-img"), "subcategory thumbnail was removed");
  assert.deepEqual(findBannerBackdropNodes(tree), [], "an in-flow tile must not read as a backdrop");
});

test("a node re-added under the same label is removed even with a fresh id", () => {
  const tree = cdCategoryTree();
  const banner = (tree.root as unknown as { children: { children: Record<string, unknown>[] }[] }).children[0];
  banner.children[0] = {
    id: "img-99zz",
    kind: "element",
    tag: "img",
    label: "banner-bg",
    classes: ["object-cover", "opacity-30", "absolute", "inset-0"],
    attrs: { src: { kind: "binding", path: "category.image_url" } },
  };
  const { removed } = stripCategoryBannerBackdrop(tree);
  assert.ok(removed.includes("img-99zz"));
});

test("Industry Kitchens' tree is a no-op — nothing removed, nothing changed", () => {
  const before = ikCategoryTree();
  const { tree, removed } = stripCategoryBannerBackdrop(before);
  assert.deepEqual(removed, []);
  assert.deepEqual(tree, before);
});

test("idempotent: running it twice is running it once", () => {
  const once = stripCategoryBannerBackdrop(cdCategoryTree()).tree;
  const twice = stripCategoryBannerBackdrop(once);
  assert.deepEqual(twice.removed, []);
  assert.deepEqual(twice.tree, once);
});

test("the post-condition finds the backdrop before, and nothing after", () => {
  assert.deepEqual(findBannerBackdropNodes(cdCategoryTree()), ["img-cf1"]);
  const { tree } = stripCategoryBannerBackdrop(cdCategoryTree());
  assert.deepEqual(findBannerBackdropNodes(tree), []);
});

test("a backdrop re-authored under a NEW label escapes the strip and the post-condition says so", () => {
  // The failure this pass cannot prevent, only report. Id and label matching are
  // both defeated by a designer who deletes the node and rebuilds it with its own
  // name, and the storefront would quietly go back to Steve's screenshot. The
  // structural check is what makes that visible, and `renderCategoryNodeBranch`
  // warns on exactly this result.
  const tree = cdCategoryTree();
  const banner = (tree.root as unknown as { children: { children: Record<string, unknown>[] }[] }).children[0];
  banner.children[0] = {
    id: "img-newname",
    kind: "element",
    tag: "img",
    label: "hero-photo",
    classes: ["object-cover", "opacity-30", "absolute", "inset-0"],
    attrs: { src: { kind: "binding", path: "category.image_url" } },
  };
  const { tree: stripped, removed } = stripCategoryBannerBackdrop(tree);
  assert.ok(!removed.includes("img-newname"), "id/label matching cannot catch a renamed node");
  assert.deepEqual(
    findBannerBackdropNodes(stripped),
    ["img-newname"],
    "the post-condition must still see a full-bleed category.image_url behind the banner"
  );
});
