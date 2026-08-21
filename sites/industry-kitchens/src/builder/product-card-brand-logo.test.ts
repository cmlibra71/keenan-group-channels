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
  PRODUCT_CARD_KEY,
} from "./product-card-brand-logo";

// ============================================================================
// Card tSrCcnvx. The shape below is the LIVE published `product-card` master for
// Industry Kitchens (cms_components id 34, channel 1) as read from the database
// on 2026-08-22, trimmed to the image stage: generated node ids, an <img> shown
// when `props.card.image_url` is set and a grey package box shown when it is
// not. The transform has to find the grey box WITHOUT an id to match on.
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
  const { tree, inserted } = applyBrandLogoFallback(liveCardTree());
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
  const { tree } = applyBrandLogoFallback(liveCardTree());
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
  const { tree } = applyBrandLogoFallback(liveCardTree());
  const photo = find(tree.root as unknown as Rec, "n-msh95giu-ab0b4")!;
  assert.equal(condition(photo), "props.card.image_url");
  assert.deepEqual(photo.classes, ["object-cover"]);
  const attrs = photo.attrs as Record<string, { path?: string }>;
  assert.equal(attrs.src.path, "props.card.image_url");
});

test("the photo carries a broken-FILE fallback the server could never decide", () => {
  const { tree } = applyBrandLogoFallback(liveCardTree());
  const photo = find(tree.root as unknown as Rec, "n-msh95giu-ab0b4")!;
  const attrs = photo.attrs as Record<string, { path?: string; value?: string }>;
  assert.equal(attrs["data-fallback-src"].path, "props.card.brand_logo_url");
  assert.equal(attrs["data-fallback-alt"].path, "props.card.brand_name");
  // Never the photo's own `object-cover`: a 600x300 logo cropped to a square
  // stage loses half its width.
  assert.equal(attrs["data-fallback-class"].value, "object-contain p-6");
});

test("the logo is contained, not cropped — a 600x300 logo must stay readable", () => {
  const { tree } = applyBrandLogoFallback(liveCardTree());
  const logo = find(tree.root as unknown as Rec, BRAND_LOGO_FALLBACK_ID)!;
  const classes = logo.classes as string[];
  assert.ok(classes.includes("object-contain"));
  assert.ok(!classes.includes("object-cover"));
  const attrs = logo.attrs as Record<string, { path?: string }>;
  assert.equal(attrs.src.path, "props.card.brand_logo_url");
  assert.equal(attrs.alt.path, "props.card.brand_name");
});

test("idempotent: a tree that already carries the node comes back untouched", () => {
  const once = applyBrandLogoFallback(liveCardTree());
  const twice = applyBrandLogoFallback(once.tree);
  assert.equal(twice.inserted, false);
  assert.equal(twice.tree, once.tree, "same object — nothing rebuilt");
});

test("a redesigned card with no grey box is reported, not guessed at", () => {
  const tree = {
    v: 1,
    root: { id: "root", kind: "element", tag: "div", children: [{ id: "img", kind: "element", tag: "img" }] },
  } as unknown as NodeTree;
  const result = applyBrandLogoFallback(tree);
  assert.equal(result.inserted, false);
  assert.equal(result.tree, tree);
});

test("the source tree is never mutated", () => {
  const source = liveCardTree();
  const before = JSON.stringify(source);
  applyBrandLogoFallback(source);
  assert.equal(JSON.stringify(source), before);
});

test("withBrandLogoFallback touches the product-card master and nothing else", () => {
  const other = liveCardTree();
  const components = { [PRODUCT_CARD_KEY]: liveCardTree(), "price-block": other };
  const out = withBrandLogoFallback(components as unknown as Record<string, unknown>) as Record<
    string,
    NodeTree
  >;
  assert.notEqual(out[PRODUCT_CARD_KEY], components[PRODUCT_CARD_KEY]);
  assert.equal(out["price-block"], other, "every other master is passed through by reference");
});

test("a channel with no product-card master comes back unchanged", () => {
  const components = { "price-block": liveCardTree() };
  const out = withBrandLogoFallback(components as unknown as Record<string, unknown>);
  assert.equal(out, components);
});
