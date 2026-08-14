import test from "node:test";
import assert from "node:assert/strict";
import type { NodeTree } from "@keenan/services/builder";
import {
  applyBrandLogoLink,
  checkBrandLogoLink,
  BRAND_LOGO_LINK_ID,
  BRAND_EYEBROW_ID,
  EYEBROW_FALLBACK_CONDITION,
} from "./brand-logo-link";
import { SEED_PRODUCT_TREE } from "./seeds/product";

type Rec = Record<string, unknown>;

function find(node: Rec, id: string): Rec | null {
  if (node.id === id) return node;
  for (const child of (node.children as Rec[]) ?? []) {
    const hit = find(child, id);
    if (hit) return hit;
  }
  return null;
}

function parentOf(node: Rec, id: string): Rec | null {
  for (const child of (node.children as Rec[]) ?? []) {
    if (child.id === id) return node;
    const hit = parentOf(child, id);
    if (hit) return hit;
  }
  return null;
}

/** Chefs Depot's shape: the buy column opens with the plain-text brand eyebrow. */
function cdTemplate(): NodeTree {
  return {
    v: 1,
    root: {
      id: "pdp-root",
      kind: "element",
      tag: "div",
      children: [
        {
          id: "buy",
          kind: "element",
          tag: "div",
          children: [
            {
              id: BRAND_EYEBROW_ID,
              kind: "element",
              tag: "p",
              condition: { kind: "data", path: "brand.name" },
              text: [{ kind: "binding", path: "brand.name" }],
            },
            {
              id: "title",
              kind: "element",
              tag: "h1",
              text: [{ kind: "binding", path: "product.name" }],
            },
          ],
        },
      ],
    },
  } as unknown as NodeTree;
}

/** Industry Kitchens' shape: no eyebrow — the buy column opens with the title. */
function ikTemplate(): NodeTree {
  return {
    v: 1,
    root: {
      id: "n-root",
      kind: "element",
      tag: "div",
      children: [
        {
          id: "n-buy",
          kind: "element",
          tag: "div",
          children: [
            { id: "n-h1", kind: "element", tag: "h1", text: [{ kind: "binding", path: "product.name" }] },
            { id: "n-sku", kind: "element", tag: "p", text: [{ kind: "binding", path: "product.sku" }] },
          ],
        },
      ],
    },
  } as unknown as NodeTree;
}

test("the brand logo lands directly above the brand line, as a nofollow link with an ALT tag", () => {
  const { tree, inserted, anchorId, eyebrowGuarded } = applyBrandLogoLink(cdTemplate());
  assert.equal(inserted, true);
  assert.equal(anchorId, BRAND_EYEBROW_ID);
  assert.equal(eyebrowGuarded, true);
  assert.deepEqual(checkBrandLogoLink(tree), []);

  const buy = find(tree.root as unknown as Rec, "buy") as Rec;
  const ids = (buy.children as Rec[]).map((c) => c.id);
  assert.deepEqual(ids, [BRAND_LOGO_LINK_ID, BRAND_EYEBROW_ID, "title"]);

  const link = find(tree.root as unknown as Rec, BRAND_LOGO_LINK_ID) as Rec;
  const attrs = link.attrs as Record<string, Rec>;
  assert.equal(link.tag, "a");
  assert.equal(attrs.rel.value, "nofollow");
  assert.equal(attrs.href.path, "brand.href");
  assert.equal(link.text, undefined, "the link carries no text — image only");

  const img = (link.children as Rec[])[0];
  const imgAttrs = img.attrs as Record<string, Rec>;
  assert.equal(img.tag, "img");
  assert.equal(imgAttrs.src.path, "brand.imageUrl");
  assert.equal(imgAttrs.alt.path, "brand.name");
});

test("a brand with no logo keeps the plain-text brand line instead", () => {
  const { tree } = applyBrandLogoLink(cdTemplate());
  const eyebrow = find(tree.root as unknown as Rec, BRAND_EYEBROW_ID) as Rec;
  assert.deepEqual(eyebrow.condition, { kind: "expr", source: EYEBROW_FALLBACK_CONDITION });
  const link = find(tree.root as unknown as Rec, BRAND_LOGO_LINK_ID) as Rec;
  assert.deepEqual(link.condition, { kind: "expr", source: "brand.imageUrl && brand.href" });
});

test("a template with no brand line anchors on the product title (Industry Kitchens)", () => {
  const { tree, inserted, anchorId, eyebrowGuarded } = applyBrandLogoLink(ikTemplate());
  assert.equal(inserted, true);
  assert.equal(anchorId, "n-h1");
  assert.equal(eyebrowGuarded, false);
  assert.deepEqual(checkBrandLogoLink(tree), []);
  const buy = find(tree.root as unknown as Rec, "n-buy") as Rec;
  assert.deepEqual((buy.children as Rec[]).map((c) => c.id), [BRAND_LOGO_LINK_ID, "n-h1", "n-sku"]);
});

test("re-running changes nothing", () => {
  const once = applyBrandLogoLink(cdTemplate());
  const twice = applyBrandLogoLink(once.tree);
  assert.equal(twice.inserted, false);
  assert.equal(JSON.stringify(twice.tree), JSON.stringify(once.tree));
});

test("a tree with nothing to anchor on is reported, never guessed at", () => {
  const orphan = {
    v: 1,
    root: { id: "r", kind: "element", tag: "div", children: [{ id: "x", kind: "element", tag: "p" }] },
  } as unknown as NodeTree;
  const { inserted, anchorId } = applyBrandLogoLink(orphan);
  assert.equal(inserted, false);
  assert.equal(anchorId, null);
  assert.deepEqual(checkBrandLogoLink(orphan), ["no brand-logo-link node"]);
});

test("the shipped seed carries the link, above its brand line", () => {
  assert.deepEqual(checkBrandLogoLink(SEED_PRODUCT_TREE), []);
  const parent = parentOf(SEED_PRODUCT_TREE.root as unknown as Rec, BRAND_LOGO_LINK_ID) as Rec;
  const ids = (parent.children as Rec[]).map((c) => c.id);
  assert.equal(ids.indexOf(BRAND_LOGO_LINK_ID) + 1, ids.indexOf(BRAND_EYEBROW_ID));
  // Re-running the database pass over the seed is a no-op — the two agree.
  assert.equal(applyBrandLogoLink(SEED_PRODUCT_TREE).inserted, false);
});
