import test from "node:test";
import assert from "node:assert/strict";
import type { NodeTree } from "@keenan/services/builder";
import {
  enlargeSubcategoryTiles,
  findSmallSubcategoryThumbs,
  LARGE_TILE_IMAGE_SIZES,
  LARGE_TILE_MAX_SUBCATEGORIES,
} from "./subcategory-tile-size";

const IK = 1;
const CD = 2;

/**
 * A miniature of Industry Kitchens' published `category_layout` tree (cms_pages
 * row 70, version 141), copied field-for-field from production on 2026-09-05:
 * the subcategory section as Steve screenshotted it, plus the listing grid that
 * shares the labels `grid` and `name` and must NOT be touched.
 */
function ikCategoryTree(): NodeTree {
  return {
    v: 1,
    root: {
      id: "n-msh8i4pb-7bink",
      tag: "div",
      kind: "element",
      label: "category-page",
      classes: ["mx-auto", "max-w-7xl"],
      children: [
        {
          id: "n-msh8i4pb-8w1d4",
          tag: "div",
          kind: "element",
          label: "subcategories",
          classes: ["mb-10"],
          condition: { kind: "expr", source: "subcategories[0]" },
          children: [
            {
              id: "n-msh8i4pb-w0y5y",
              tag: "h2",
              kind: "element",
              label: "heading",
              classes: ["text-lg", "font-semibold", "text-zinc-900", "mb-4"],
              text: [{ kind: "static", value: "Subcategories" }],
            },
            {
              id: "n-msh8i4pb-1qkij",
              tag: "div",
              kind: "element",
              label: "grid",
              classes: [
                "grid",
                "grid-cols-2",
                "sm:grid-cols-3",
                "lg:grid-cols-4",
                "xl:grid-cols-5",
                "gap-3",
              ],
              children: [
                {
                  id: "n-msh8i4pb-q2puo",
                  kind: "repeat",
                  source: "subcategories",
                  itemAlias: "sub",
                  children: [
                    {
                      id: "n-msh8i4pb-u88fx",
                      tag: "a",
                      kind: "element",
                      label: "tile",
                      attrs: { href: { kind: "binding", path: "sub.href" } },
                      classes: ["group", "flex", "items-center", "gap-3", "rounded-lg", "p-3"],
                      children: [
                        {
                          id: "n-msh8i4pb-vbibs",
                          tag: "div",
                          kind: "element",
                          label: "thumb",
                          classes: ["relative", "h-12", "w-12", "flex-shrink-0"],
                          condition: { kind: "expr", source: "sub.image_url" },
                          children: [
                            {
                              id: "n-msh8i4pb-f219i",
                              tag: "img",
                              kind: "element",
                              label: "image",
                              classes: ["rounded", "object-cover"],
                              attrs: {
                                alt: { kind: "binding", path: "sub.name" },
                                src: { kind: "binding", path: "sub.image_url" },
                                fill: { kind: "static", value: "true" },
                                sizes: { kind: "static", value: "48px" },
                              },
                            },
                          ],
                        },
                        {
                          id: "n-msh8i4pb-5b8hc",
                          tag: "div",
                          kind: "element",
                          label: "no-thumb",
                          classes: ["h-12", "w-12", "rounded", "bg-zinc-100", "flex"],
                          condition: { kind: "expr", source: "!sub.image_url" },
                          children: [
                            {
                              id: "n-msh8i4pb-uay2o",
                              tag: "svg",
                              kind: "element",
                              label: "package-icon",
                              classes: ["h-5", "w-5", "text-zinc-300"],
                              children: [
                                { id: "n-msh8i4pb-ihyb3", tag: "path", kind: "element", classes: [] },
                              ],
                            },
                          ],
                        },
                        {
                          id: "n-msh8i4pb-r14l3",
                          tag: "span",
                          kind: "element",
                          label: "name",
                          classes: ["text-sm", "font-medium", "text-zinc-700", "line-clamp-2"],
                          text: [{ kind: "binding", path: "sub.name" }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          id: "n-msh8i4pb-jr7hk",
          tag: "div",
          kind: "element",
          label: "grid",
          classes: ["grid", "grid-cols-2", "sm:grid-cols-3", "lg:grid-cols-4", "gap-6"],
          children: [
            {
              id: "n-msh8i4pb-8si7y",
              kind: "repeat",
              source: "listing.products",
              children: [
                { id: "n-msh8i4pb-edsiw", kind: "component", componentKey: "product-card", label: "card" },
              ],
            },
          ],
        },
      ],
    },
  } as unknown as NodeTree;
}

/** Chefs Depot's tree: no subcategory section at all (verified on prod). */
function cdCategoryTree(): NodeTree {
  return {
    v: 1,
    root: {
      id: "div-seed-24",
      tag: "div",
      kind: "element",
      label: "category-page",
      children: [
        {
          id: "div-seed-18",
          tag: "div",
          kind: "element",
          label: "product-grid",
          classes: ["grid", "grid-cols-2", "lg:grid-cols-4"],
          children: [],
        },
      ],
    },
  } as unknown as NodeTree;
}

type Rec = Record<string, unknown>;

function byId(tree: NodeTree, id: string): Rec | null {
  let found: Rec | null = null;
  const walk = (n: Rec) => {
    if (n.id === id) found = n;
    for (const key of ["children", "emptyChildren"]) {
      const kids = n[key];
      if (Array.isArray(kids)) for (const c of kids as Rec[]) if (c) walk(c);
    }
  };
  walk(tree.root as unknown as Rec);
  return found;
}

function classesOf(tree: NodeTree, id: string): string[] {
  const node = byId(tree, id);
  assert.ok(node, `node ${id} is missing`);
  return ((node as Rec).classes as string[]) ?? [];
}

test("the picture becomes the tile: full-width square above the name", () => {
  const { tree, rewritten } = enlargeSubcategoryTiles(ikCategoryTree(), IK);

  // The tile stacks instead of sitting side by side, and clips the picture.
  const tile = classesOf(tree, "n-msh8i4pb-u88fx");
  assert.ok(tile.includes("flex-col"), "tile is still a row");
  assert.ok(tile.includes("overflow-hidden"), "tile does not clip the picture");
  assert.ok(!tile.includes("items-center"), "the old side-by-side alignment survived");
  assert.ok(!tile.includes("p-3"), "the padding that shrank the picture survived");

  // The 48px box is gone on both branches.
  assert.deepEqual(classesOf(tree, "n-msh8i4pb-vbibs"), [
    "relative",
    "aspect-square",
    "w-full",
    "bg-white",
  ]);
  const placeholder = classesOf(tree, "n-msh8i4pb-5b8hc");
  assert.ok(placeholder.includes("aspect-square") && placeholder.includes("w-full"));
  assert.ok(!placeholder.includes("h-12"), "the grey box is still 48px");

  // The name moves under the picture.
  const name = classesOf(tree, "n-msh8i4pb-r14l3");
  assert.ok(name.includes("border-t") && name.includes("text-center"));

  assert.deepEqual(rewritten.sort(), [
    "grid",
    "image",
    "name",
    "no-thumb",
    "package-icon",
    "thumb",
    "tile",
  ]);
});

test("a bigger tile asks the image proxy for a bigger source", () => {
  const { tree } = enlargeSubcategoryTiles(ikCategoryTree(), IK);
  const img = byId(tree, "n-msh8i4pb-f219i") as Rec;
  const attrs = img.attrs as Record<string, { kind: string; value?: string; path?: string }>;
  assert.equal(attrs.sizes.value, LARGE_TILE_IMAGE_SIZES);
  assert.notEqual(attrs.sizes.value, "48px");
  // Every other attribute is copied through untouched — the binding above all.
  assert.deepEqual(attrs.src, { kind: "binding", path: "sub.image_url" });
  assert.deepEqual(attrs.alt, { kind: "binding", path: "sub.name" });
  assert.deepEqual(attrs.fill, { kind: "static", value: "true" });
});

test("six tiles fit one or two rows on a desktop and two across on a phone", () => {
  const { tree } = enlargeSubcategoryTiles(ikCategoryTree(), IK);
  assert.deepEqual(classesOf(tree, "n-msh8i4pb-1qkij"), [
    "grid",
    "grid-cols-2",
    "sm:grid-cols-3",
    "lg:grid-cols-4",
    "xl:grid-cols-5",
    "gap-4",
  ]);
});

test("the PRODUCT grid, which shares the label, is left alone", () => {
  const { tree } = enlargeSubcategoryTiles(ikCategoryTree(), IK);
  assert.deepEqual(classesOf(tree, "n-msh8i4pb-jr7hk"), [
    "grid",
    "grid-cols-2",
    "sm:grid-cols-3",
    "lg:grid-cols-4",
    "gap-6",
  ]);
});

test("bindings, conditions, text and component instances survive byte for byte", () => {
  const before = ikCategoryTree();
  const { tree } = enlargeSubcategoryTiles(before, IK);
  const thumb = byId(tree, "n-msh8i4pb-vbibs") as Rec;
  assert.deepEqual(thumb.condition, { kind: "expr", source: "sub.image_url" });
  const noThumb = byId(tree, "n-msh8i4pb-5b8hc") as Rec;
  assert.deepEqual(noThumb.condition, { kind: "expr", source: "!sub.image_url" });
  const repeat = byId(tree, "n-msh8i4pb-q2puo") as Rec;
  assert.equal(repeat.source, "subcategories");
  assert.equal(repeat.itemAlias, "sub");
  const nameNode = byId(tree, "n-msh8i4pb-r14l3") as Rec;
  assert.deepEqual(nameNode.text, [{ kind: "binding", path: "sub.name" }]);
  const card = byId(tree, "n-msh8i4pb-edsiw") as Rec;
  assert.equal(card.componentKey, "product-card");
  const heading = byId(tree, "n-msh8i4pb-w0y5y") as Rec;
  assert.deepEqual(heading.classes, ["text-lg", "font-semibold", "text-zinc-900", "mb-4"]);
});

test("the stored tree is not mutated", () => {
  const before = ikCategoryTree();
  const snapshot = JSON.stringify(before);
  enlargeSubcategoryTiles(before, IK);
  assert.equal(JSON.stringify(before), snapshot);
});

test("running it twice is running it once", () => {
  const once = enlargeSubcategoryTiles(ikCategoryTree(), IK).tree;
  const twice = enlargeSubcategoryTiles(once, IK).tree;
  assert.equal(JSON.stringify(twice), JSON.stringify(once));
});

test("Chefs Depot is untouched — by the channel gate AND by its data", () => {
  const ikOnCd = enlargeSubcategoryTiles(ikCategoryTree(), CD);
  assert.deepEqual(ikOnCd.rewritten, []);
  assert.equal(JSON.stringify(ikOnCd.tree), JSON.stringify(ikCategoryTree()));

  const cd = enlargeSubcategoryTiles(cdCategoryTree(), CD);
  assert.deepEqual(cd.rewritten, []);
  // And even if the gate were widened, CD's tree has no strip to change.
  const cdAsIk = enlargeSubcategoryTiles(cdCategoryTree(), IK);
  assert.deepEqual(cdAsIk.rewritten, []);
  assert.equal(JSON.stringify(cdAsIk.tree), JSON.stringify(cdCategoryTree()));
});

test("a renamed section still matches on its published id", () => {
  const tree = ikCategoryTree();
  const section = byId(tree, "n-msh8i4pb-8w1d4") as Rec;
  delete section.label;
  const { rewritten } = enlargeSubcategoryTiles(tree, IK);
  assert.ok(rewritten.includes("tile"), "the strip was missed once its label changed");
});

test("the post-condition finds a thumbnail the pass missed, and stays quiet otherwise", () => {
  assert.deepEqual(findSmallSubcategoryThumbs(enlargeSubcategoryTiles(ikCategoryTree(), IK).tree), []);
  // An author rebuilds the thumbnail under a label nothing matches.
  const rebuilt = ikCategoryTree();
  const thumb = byId(rebuilt, "n-msh8i4pb-vbibs") as Rec;
  thumb.label = "picture";
  const { tree } = enlargeSubcategoryTiles(rebuilt, IK);
  assert.deepEqual(findSmallSubcategoryThumbs(tree), ["n-msh8i4pb-vbibs"]);
});

test("a 48px box OUTSIDE the strip is not reported", () => {
  const tree = cdCategoryTree();
  const grid = byId(tree, "div-seed-18") as Rec;
  grid.classes = ["h-12", "w-12"];
  assert.deepEqual(findSmallSubcategoryThumbs(tree), []);
});

// ---------------------------------------------------------------------------
// The cap. Steve's screenshot is a six-tile strip; Industry Kitchens also has
// categories whose children are a DIRECTORY (`/categories/brands`: 395), where
// the big tile grows the page from 19,908px to 35,815px and buries the listing.
// ---------------------------------------------------------------------------

test("a directory-sized strip keeps the tile it has, and says so", () => {
  const result = enlargeSubcategoryTiles(ikCategoryTree(), IK, { subcategoryCount: 395 });
  assert.equal(result.applied, false, "the big tile must not apply to a 395-child directory");
  assert.deepEqual(result.rewritten, []);
  assert.equal(JSON.stringify(result.tree), JSON.stringify(ikCategoryTree()));
});

test("the cap is inclusive, and one over it is out", () => {
  const at = enlargeSubcategoryTiles(ikCategoryTree(), IK, {
    subcategoryCount: LARGE_TILE_MAX_SUBCATEGORIES,
  });
  assert.equal(at.applied, true);
  assert.ok(at.rewritten.includes("tile"));

  const over = enlargeSubcategoryTiles(ikCategoryTree(), IK, {
    subcategoryCount: LARGE_TILE_MAX_SUBCATEGORIES + 1,
  });
  assert.equal(over.applied, false);
  assert.deepEqual(over.rewritten, []);
});

test("an unknown count still gets the card's tile", () => {
  // A caller that cannot count must not silently lose the fix.
  const result = enlargeSubcategoryTiles(ikCategoryTree(), IK, {});
  assert.equal(result.applied, true);
  assert.ok(result.rewritten.includes("tile"));
});

test("`applied` is false for the wrong channel, so the caller's warning stays quiet", () => {
  const cd = enlargeSubcategoryTiles(ikCategoryTree(), CD, { subcategoryCount: 6 });
  assert.equal(cd.applied, false);
  // And this is the case the post-condition would otherwise shout about on
  // every Chefs Depot category render: a 48px thumb the pass left alone ON PURPOSE.
  assert.ok(findSmallSubcategoryThumbs(cd.tree).length > 0);
});

test("the cap is overridable, so the threshold lives in one place", () => {
  const result = enlargeSubcategoryTiles(ikCategoryTree(), IK, {
    subcategoryCount: 30,
    maxSubcategories: 40,
  });
  assert.equal(result.applied, true);
});
