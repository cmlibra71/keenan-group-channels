import { test } from "node:test";
import assert from "node:assert/strict";
import type { NodeTree } from "@keenan/services/builder";
import {
  applyBrandLogoFallback,
  withBrandLogoFallback,
  BRAND_LOGO_FALLBACK_ID,
  BRAND_LOGO_CONDITION,
  NO_IMAGE_CONDITION,
  NO_IMAGE_NO_LOGO_CONDITION,
  PHOTO_CONDITION,
  PRODUCT_CARD_KEY,
  CLEARANCE_SPOTLIGHT_KEY,
  CLEARANCE_BRAND_LOGO_FALLBACK_ID,
  INDUSTRY_KITCHENS_TARGETS,
  CHEFS_DEPOT_TARGETS,
  targetsForChannel,
} from "./product-card-brand-logo";

// ============================================================================
// Card tSrCcnvx. The shape below is the LIVE published `product-card` master for
// Industry Kitchens (cms_components id 34, channel 1) as read from the database
// on 2026-08-22, trimmed to the image stage: generated node ids, an <img> shown
// when `props.card.image_url` is set and a grey package box shown when it is
// not. The transform has to find the grey box WITHOUT an id to match on.
//
// The channel's TARGET LIST is passed explicitly throughout, never read off the
// ambient CHANNEL_ID: this file is shared, so it runs inside all three trees and
// must assert the same things in each.
// ============================================================================

type Rec = Record<string, unknown>;

function liveCardTree(): NodeTree {
  return {
    v: 1,
    root: {
      id: "n-msh95giu-root",
      kind: "element",
      tag: "a",
      children: [
        {
          id: "n-msh95giu-xj0t1",
          kind: "element",
          tag: "div",
          label: "image-stage",
          classes: ["relative", "aspect-square", "overflow-hidden", "rounded-lg", "bg-zinc-100"],
          children: [
            {
              id: "n-msh95giu-ab0b4",
              kind: "element",
              tag: "img",
              label: "image",
              classes: ["object-cover"],
              attrs: {
                alt: { kind: "binding", path: "props.card.name" },
                src: { kind: "binding", path: "props.card.image_url" },
                fill: { kind: "static", value: "true" },
              },
              condition: { kind: "expr", source: "props.card.image_url" },
            },
            {
              id: "n-msh95giu-7ch8h",
              kind: "element",
              tag: "div",
              label: "no-image",
              classes: ["h-full", "w-full", "flex"],
              children: [{ id: "n-msh95giu-dhz2z", kind: "element", tag: "svg", classes: ["h-12", "w-12"] }],
              condition: { kind: "expr", source: NO_IMAGE_CONDITION },
            },
          ],
        },
        { id: "n-msh95giu-name", kind: "element", tag: "h3", classes: [] },
      ],
    },
  } as unknown as NodeTree;
}

/** Industry Kitchens' listing-tile target — the one most of these tests drive. */
const IK_CARD_TARGET = INDUSTRY_KITCHENS_TARGETS.find((t) => t.key === PRODUCT_CARD_KEY)!;

/** Chefs Depot's listing-tile target: same master key, that site's own stage. */
const CD_CARD_TARGET = CHEFS_DEPOT_TARGETS.find((t) => t.key === PRODUCT_CARD_KEY)!;

function find(node: Rec, id: string): Rec | null {
  if (node.id === id) return node;
  for (const key of ["children", "emptyChildren"]) {
    const kids = node[key];
    if (!Array.isArray(kids)) continue;
    for (const child of kids as Rec[]) {
      if (!child || typeof child !== "object") continue;
      const hit = find(child, id);
      if (hit) return hit;
    }
  }
  return null;
}

function condition(node: Rec | null): string {
  const c = node?.condition as { source?: string } | undefined;
  return c?.source ?? "";
}

test("the brand logo is inserted beside the grey box, not instead of it", () => {
  const { tree, inserted } = applyBrandLogoFallback(liveCardTree(), IK_CARD_TARGET);
  assert.equal(inserted, true);

  const root = tree.root as unknown as Rec;
  const logo = find(root, BRAND_LOGO_FALLBACK_ID);
  assert.ok(logo, "the fallback image node is present");
  assert.equal(logo!.tag, "img");
  assert.equal(condition(logo), BRAND_LOGO_CONDITION);

  const greyBox = find(root, "n-msh95giu-7ch8h");
  assert.ok(greyBox, "the grey box survives — it is still the last resort");
  assert.equal(condition(greyBox), NO_IMAGE_NO_LOGO_CONDITION);
});

test("exactly one image branch can be true for any row", () => {
  const { tree } = applyBrandLogoFallback(liveCardTree(), IK_CARD_TARGET);
  const root = tree.root as unknown as Rec;
  const photo = condition(find(root, "n-msh95giu-ab0b4"));
  const logo = condition(find(root, BRAND_LOGO_FALLBACK_ID));
  const grey = condition(find(root, "n-msh95giu-7ch8h"));

  const evaluate = (source: string, card: { image_url: string; brand_logo_url: string }) =>
    Function("props", `return !!(${source});`)({ card }) as boolean;

  const cases = [
    { image_url: "/photo.jpg", brand_logo_url: "/logo.png" },
    { image_url: "/photo.jpg", brand_logo_url: "" },
    { image_url: "", brand_logo_url: "/logo.png" },
    { image_url: "", brand_logo_url: "" },
  ];
  for (const card of cases) {
    const live = [photo, logo, grey].filter((source) => evaluate(source, card));
    assert.equal(live.length, 1, `one branch for ${JSON.stringify(card)}, got ${live.length}`);
  }
});

test("a product WITH a working image is unaffected — same condition, same classes, same src", () => {
  const { tree } = applyBrandLogoFallback(liveCardTree(), IK_CARD_TARGET);
  const photo = find(tree.root as unknown as Rec, "n-msh95giu-ab0b4")!;
  assert.equal(condition(photo), "props.card.image_url");
  assert.deepEqual(photo.classes, ["object-cover"]);
  const attrs = photo.attrs as Record<string, { path?: string }>;
  assert.equal(attrs.src.path, "props.card.image_url");
});

test("the photo carries a broken-FILE fallback the server could never decide", () => {
  const { tree } = applyBrandLogoFallback(liveCardTree(), IK_CARD_TARGET);
  const photo = find(tree.root as unknown as Rec, "n-msh95giu-ab0b4")!;
  const attrs = photo.attrs as Record<string, { path?: string; value?: string }>;
  assert.equal(attrs["data-fallback-src"].path, "props.card.brand_logo_url");
  assert.equal(attrs["data-fallback-alt"].path, "props.card.brand_name");
  // Never the photo's own `object-cover`: a 600x300 logo cropped to a square
  // stage loses half its width.
  assert.equal(attrs["data-fallback-class"].value, "object-contain p-6");
});

test("the logo is contained, not cropped — a 600x300 logo must stay readable", () => {
  const { tree } = applyBrandLogoFallback(liveCardTree(), IK_CARD_TARGET);
  const logo = find(tree.root as unknown as Rec, BRAND_LOGO_FALLBACK_ID)!;
  const classes = logo.classes as string[];
  assert.ok(classes.includes("object-contain"));
  assert.ok(!classes.includes("object-cover"));
  const attrs = logo.attrs as Record<string, { path?: string }>;
  assert.equal(attrs.src.path, "props.card.brand_logo_url");
  assert.equal(attrs.alt.path, "props.card.brand_name");
});

test("idempotent: a tree that already carries the node comes back untouched", () => {
  const once = applyBrandLogoFallback(liveCardTree(), IK_CARD_TARGET);
  const twice = applyBrandLogoFallback(once.tree, IK_CARD_TARGET);
  assert.equal(twice.inserted, false);
  assert.equal(twice.tree, once.tree, "same object — nothing rebuilt");
});

test("a redesigned card with no grey box is reported, not guessed at", () => {
  const tree = {
    v: 1,
    root: { id: "root", kind: "element", tag: "div", children: [{ id: "img", kind: "element", tag: "img" }] },
  } as unknown as NodeTree;
  const result = applyBrandLogoFallback(tree, IK_CARD_TARGET);
  assert.equal(result.inserted, false);
  assert.equal(result.tree, tree);
});

test("the source tree is never mutated", () => {
  const source = liveCardTree();
  const before = JSON.stringify(source);
  applyBrandLogoFallback(source, IK_CARD_TARGET);
  assert.equal(JSON.stringify(source), before);
});

test("withBrandLogoFallback touches the product-card master and nothing else", () => {
  const other = liveCardTree();
  const components = { [PRODUCT_CARD_KEY]: liveCardTree(), "price-block": other };
  const out = withBrandLogoFallback(components as unknown as Record<string, unknown>, INDUSTRY_KITCHENS_TARGETS) as Record<
    string,
    NodeTree
  >;
  assert.notEqual(out[PRODUCT_CARD_KEY], components[PRODUCT_CARD_KEY]);
  assert.equal(out["price-block"], other, "every other master is passed through by reference");
});

test("a channel with no product-card master comes back unchanged", () => {
  const components = { "price-block": liveCardTree() };
  const out = withBrandLogoFallback(components as unknown as Record<string, unknown>, INDUSTRY_KITCHENS_TARGETS);
  assert.equal(out, components);
});

// ============================================================================
// The HOME page's clearance rail — the SECOND authored master, and the one a
// fix aimed only at the listing tile misses. The shape below is the LIVE
// published `home-clearance-spotlight` master for Industry Kitchens
// (cms_components, channel 1) as read from the database on 2026-08-25, trimmed
// to the image stage. Note the binding prefix: this master addresses the row
// through the repeat's item alias `card`, NOT `props.card`.
// ============================================================================

function liveClearanceTree(): NodeTree {
  return {
    v: 1,
    root: {
      id: "n-mshd2l5v-jrl4v",
      kind: "element",
      tag: "section",
      condition: { kind: "expr", source: "props.section.products[0]" },
      children: [
        {
          id: "n-mshd2l5v-owb6z",
          kind: "element",
          tag: "div",
          classes: ["grid", "grid-cols-2", "sm:grid-cols-3"],
          children: [
            {
              id: "n-mshd2l5v-gmqy4",
              kind: "repeat",
              label: "cards",
              limit: 9,
              source: "props.section.products",
              itemAlias: "card",
              children: [
                {
                  id: "n-mshd2l5v-wtzh2",
                  kind: "element",
                  tag: "div",
                  classes: ["relative", "aspect-square", "bg-white"],
                  children: [
                    {
                      id: "n-mshd2l5v-ek92y",
                      kind: "element",
                      tag: "img",
                      label: "image",
                      classes: [
                        "object-contain",
                        "p-4",
                        "group-hover:scale-[1.03]",
                        "transition-transform",
                        "duration-500",
                        "ease-out",
                      ],
                      attrs: {
                        alt: { kind: "binding", path: "card.name" },
                        src: { kind: "binding", path: "card.image_url" },
                        fill: { kind: "static", value: "true" },
                        sizes: { kind: "static", value: "(max-width: 640px) 50vw, 33vw" },
                      },
                      condition: { kind: "expr", source: "card.image_url" },
                    },
                    {
                      id: "n-mshd2l5v-hpm3s",
                      kind: "element",
                      tag: "div",
                      label: "no-image",
                      classes: ["h-full", "w-full", "flex"],
                      children: [
                        { id: "n-mshd2l5v-23mxk", kind: "element", tag: "svg", classes: ["h-10", "w-10"] },
                      ],
                      condition: { kind: "expr", source: "!card.image_url" },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  } as unknown as NodeTree;
}

const CLEARANCE_TARGET = INDUSTRY_KITCHENS_TARGETS.find((t) => t.key === CLEARANCE_SPOTLIGHT_KEY)!;

test("the clearance rail's master gets the same fallback, on its own `card.` prefix", () => {
  const { tree, inserted } = applyBrandLogoFallback(liveClearanceTree(), CLEARANCE_TARGET);
  assert.equal(inserted, true);
  const logo = find(tree.root as unknown as Rec, CLEARANCE_BRAND_LOGO_FALLBACK_ID);
  assert.ok(logo, "the rail's logo node is inserted");
  assert.equal(condition(logo), "!card.image_url && card.brand_logo_url");
  const attrs = logo!.attrs as Record<string, { path?: string; value?: string }>;
  assert.equal(attrs.src.path, "card.brand_logo_url");
  assert.equal(attrs.alt.path, "card.brand_name");
  assert.equal(attrs.fill.value, "true");
});

test("the rail's grey box is narrowed so exactly one branch can be true", () => {
  const { tree } = applyBrandLogoFallback(liveClearanceTree(), CLEARANCE_TARGET);
  const grey = find(tree.root as unknown as Rec, "n-mshd2l5v-hpm3s");
  assert.equal(condition(grey), "!card.image_url && !card.brand_logo_url");
});

test("the rail's logo matches the rail's own padding, not the listing tile's", () => {
  const { tree } = applyBrandLogoFallback(liveClearanceTree(), CLEARANCE_TARGET);
  const logo = find(tree.root as unknown as Rec, CLEARANCE_BRAND_LOGO_FALLBACK_ID);
  assert.deepEqual(logo!.classes, ["object-contain", "p-4"]);
  assert.ok(!(logo!.classes as string[]).includes("object-cover"), "a 2:1 logo is never cropped");
});

test("the rail's photo carries the broken-FILE fallback on the same prefix", () => {
  const { tree } = applyBrandLogoFallback(liveClearanceTree(), CLEARANCE_TARGET);
  const photo = find(tree.root as unknown as Rec, "n-mshd2l5v-ek92y");
  const attrs = photo!.attrs as Record<string, { path?: string; value?: string }>;
  assert.equal(attrs["data-fallback-src"].path, "card.brand_logo_url");
  assert.equal(attrs["data-fallback-alt"].path, "card.brand_name");
  assert.equal(attrs["data-fallback-class"].value, "object-contain p-4");
  // untouched otherwise
  assert.equal(attrs.src.path, "card.image_url");
  assert.equal(condition(photo), "card.image_url");
});

test("the listing-tile target never matches the rail's master, and vice versa", () => {
  // Wrong prefix = no anchor = nothing guessed at.
  assert.equal(applyBrandLogoFallback(liveClearanceTree(), IK_CARD_TARGET).inserted, false);
  assert.equal(applyBrandLogoFallback(liveCardTree(), CLEARANCE_TARGET).inserted, false);
});

test("withBrandLogoFallback fixes BOTH masters in one pass", () => {
  const untouched = liveCardTree();
  const components = {
    [PRODUCT_CARD_KEY]: liveCardTree(),
    [CLEARANCE_SPOTLIGHT_KEY]: liveClearanceTree(),
    "price-block": untouched,
  };
  const out = withBrandLogoFallback(components as unknown as Record<string, unknown>, INDUSTRY_KITCHENS_TARGETS) as Record<
    string,
    NodeTree
  >;
  assert.ok(find(out[PRODUCT_CARD_KEY].root as unknown as Rec, BRAND_LOGO_FALLBACK_ID));
  assert.ok(
    find(out[CLEARANCE_SPOTLIGHT_KEY].root as unknown as Rec, CLEARANCE_BRAND_LOGO_FALLBACK_ID)
  );
  assert.equal(out["price-block"], untouched, "every other master is passed through by reference");
});

test("idempotent across both masters", () => {
  const components = {
    [PRODUCT_CARD_KEY]: liveCardTree(),
    [CLEARANCE_SPOTLIGHT_KEY]: liveClearanceTree(),
  } as unknown as Record<string, unknown>;
  const once = withBrandLogoFallback(components, INDUSTRY_KITCHENS_TARGETS);
  const twice = withBrandLogoFallback(once, INDUSTRY_KITCHENS_TARGETS);
  assert.equal(twice, once, "a second pass changes nothing and copies nothing");
});


// ============================================================================
// CHEFS DEPOT (channel 2). Steve asked for the same fallback on this card on
// 2026-08-24 — "Please implement the same temporary fix for Chefs Depot, until
// the missing images are sourced" — so the SAME transform runs over that site's
// own `product-card` master. The shape below is the LIVE published channel-2
// master as read from the database on 2026-09-04, trimmed to the image stage.
// It differs from Industry Kitchens' in exactly the way that matters here: its
// photo is a PLAIN image sized by the stage (`h-full w-full object-contain p-3`)
// with no `fill` attribute, so the inserted logo must not declare one either.
// ============================================================================

function liveCdCardTree(): NodeTree {
  return {
    v: 1,
    root: {
      id: "a-cseed-root",
      kind: "element",
      tag: "div",
      children: [
        {
          id: "a-cseed-stage",
          kind: "element",
          tag: "a",
          classes: ["relative", "block", "aspect-square", "bg-white"],
          children: [
            {
              id: "img-cseed-1",
              kind: "element",
              tag: "img",
              classes: [
                "h-full",
                "w-full",
                "object-contain",
                "p-3",
                "transition-transform",
                "duration-500",
                "ease-out",
                "group-hover:scale-[1.04]",
              ],
              attrs: {
                alt: { kind: "binding", path: "props.card.name" },
                src: { kind: "binding", path: "props.card.image_url" },
              },
              condition: { kind: "expr", source: PHOTO_CONDITION },
            },
            {
              id: "div-cseed-7",
              kind: "element",
              tag: "div",
              label: "no-image",
              classes: ["flex", "h-full", "w-full", "items-center", "justify-center", "text-steel-300"],
              children: [{ id: "svg-cseed-6", kind: "element", tag: "svg", classes: [] }],
              condition: { kind: "expr", source: NO_IMAGE_CONDITION },
            },
          ],
        },
      ],
    },
  } as unknown as NodeTree;
}

test("Chefs Depot's own master gets the logo branch, on the same prefix", () => {
  const { tree, inserted } = applyBrandLogoFallback(liveCdCardTree(), CD_CARD_TARGET);
  assert.equal(inserted, true);
  const logo = find(tree.root as unknown as Rec, BRAND_LOGO_FALLBACK_ID);
  assert.ok(logo, "the fallback image node is present");
  assert.equal(condition(logo), BRAND_LOGO_CONDITION);
  const attrs = logo!.attrs as Record<string, { path?: string; value?: string }>;
  assert.equal(attrs.src.path, "props.card.brand_logo_url");
  assert.equal(attrs.alt.path, "props.card.brand_name");
});

test("Chefs Depot's logo is sized by the stage, never by `fill` its photo does not use", () => {
  const { tree } = applyBrandLogoFallback(liveCdCardTree(), CD_CARD_TARGET);
  const logo = find(tree.root as unknown as Rec, BRAND_LOGO_FALLBACK_ID)!;
  const attrs = logo.attrs as Record<string, unknown>;
  assert.equal(attrs.fill, undefined, "the CD photo declares no fill, so neither may the logo");
  assert.equal(attrs.sizes, undefined, "and no sizes, so `BuilderImage` takes the same plain-img path");
  assert.deepEqual(logo.classes, ["h-full", "w-full", "object-contain", "p-6"]);
  assert.ok(!(logo.classes as string[]).includes("object-cover"), "a 2:1 logo is never cropped");
});

test("Chefs Depot's grey box is narrowed, so exactly one branch is ever true", () => {
  const { tree } = applyBrandLogoFallback(liveCdCardTree(), CD_CARD_TARGET);
  const root = tree.root as unknown as Rec;
  assert.equal(condition(find(root, "div-cseed-7")), NO_IMAGE_NO_LOGO_CONDITION);

  const evaluate = (source: string, card: { image_url: string; brand_logo_url: string }) =>
    Function("props", `return !!(${source});`)({ card }) as boolean;
  const branches = [
    condition(find(root, "img-cseed-1")),
    condition(find(root, BRAND_LOGO_FALLBACK_ID)),
    condition(find(root, "div-cseed-7")),
  ];
  for (const card of [
    { image_url: "/photo.jpg", brand_logo_url: "/logo.png" },
    { image_url: "/photo.jpg", brand_logo_url: "" },
    { image_url: "", brand_logo_url: "/logo.png" },
    { image_url: "", brand_logo_url: "" },
  ]) {
    const live = branches.filter((source) => evaluate(source, card));
    assert.equal(live.length, 1, `one branch for ${JSON.stringify(card)}, got ${live.length}`);
  }
});

test("Chefs Depot's broken-file swap keeps the photo's own layout classes", () => {
  const { tree } = applyBrandLogoFallback(liveCdCardTree(), CD_CARD_TARGET);
  const photo = find(tree.root as unknown as Rec, "img-cseed-1")!;
  const attrs = photo.attrs as Record<string, { path?: string; value?: string }>;
  assert.equal(attrs["data-fallback-src"].path, "props.card.brand_logo_url");
  assert.equal(attrs["data-fallback-alt"].path, "props.card.brand_name");
  // `h-full w-full` matter here in a way they do not on Industry Kitchens: the
  // swap REPLACES the class list, and a dimensionless <img> with no size classes
  // would render at its intrinsic size instead of filling the square stage.
  assert.equal(attrs["data-fallback-class"].value, "h-full w-full object-contain p-6");
  // Untouched otherwise.
  assert.equal(attrs.src.path, "props.card.image_url");
  assert.equal(condition(photo), PHOTO_CONDITION);
});

test("Chefs Depot has no second product master, so nothing else is rewritten", () => {
  const untouched = liveClearanceTree();
  const components = {
    [PRODUCT_CARD_KEY]: liveCdCardTree(),
    [CLEARANCE_SPOTLIGHT_KEY]: untouched,
  } as unknown as Record<string, unknown>;
  const out = withBrandLogoFallback(components, CHEFS_DEPOT_TARGETS) as Record<string, NodeTree>;
  assert.ok(find(out[PRODUCT_CARD_KEY].root as unknown as Rec, BRAND_LOGO_FALLBACK_ID));
  assert.equal(out[CLEARANCE_SPOTLIGHT_KEY], untouched, "not one of this channel's targets");
});

test("a storefront that has not opted in renders exactly what it rendered before", () => {
  const components = {
    [PRODUCT_CARD_KEY]: liveCdCardTree(),
  } as unknown as Record<string, unknown>;
  assert.deepEqual(targetsForChannel(99), []);
  assert.equal(withBrandLogoFallback(components, targetsForChannel(99)), components);
});

test("each live storefront's targets are the masters that storefront actually has", () => {
  assert.deepEqual(
    targetsForChannel(1).map((t) => t.key),
    [PRODUCT_CARD_KEY, CLEARANCE_SPOTLIGHT_KEY]
  );
  assert.deepEqual(
    targetsForChannel(2).map((t) => t.key),
    [PRODUCT_CARD_KEY]
  );
});
