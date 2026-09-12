import test from "node:test";
import assert from "node:assert/strict";
import type { NodeTree } from "@keenan/services/builder";
import {
  applyBrandLogoLink,
  checkBrandLogoLink,
  BRAND_LOGO_LINK_ID,
  BRAND_NAME_LINK_ID,
  BRAND_EYEBROW_ID,
  EYEBROW_FALLBACK_CONDITION,
  NAME_LINK_CONDITION,
  LOGO_CONDITION,
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
              classes: ["mb-1", "text-[12px]", "uppercase", "text-accent-dark"],
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
  assert.deepEqual(ids, [BRAND_LOGO_LINK_ID, BRAND_NAME_LINK_ID, BRAND_EYEBROW_ID, "title"]);

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

test("a brand with no logo falls back to its NAME as a link to the same page", () => {
  const { tree, nameLinkInserted } = applyBrandLogoLink(cdTemplate());
  assert.equal(nameLinkInserted, true);

  const nameLink = find(tree.root as unknown as Rec, BRAND_NAME_LINK_ID) as Rec;
  const attrs = nameLink.attrs as Record<string, Rec>;
  assert.equal(nameLink.tag, "a");
  assert.equal(attrs.href.path, "brand.href");
  assert.equal(attrs.rel.value, "nofollow");
  assert.deepEqual(nameLink.text, [{ kind: "binding", path: "brand.name" }]);
  // It inherits the brand line's own styling, so the page looks unchanged.
  assert.deepEqual(nameLink.classes, ["mb-1", "text-[12px]", "uppercase", "text-accent-dark", "inline-block"]);
});

test("no two of the three brand nodes can ever show at once", () => {
  const { tree } = applyBrandLogoLink(cdTemplate());
  const logo = find(tree.root as unknown as Rec, BRAND_LOGO_LINK_ID) as Rec;
  const nameLink = find(tree.root as unknown as Rec, BRAND_NAME_LINK_ID) as Rec;
  const eyebrow = find(tree.root as unknown as Rec, BRAND_EYEBROW_ID) as Rec;

  assert.deepEqual(logo.condition, { kind: "expr", source: LOGO_CONDITION });
  assert.deepEqual(nameLink.condition, { kind: "expr", source: NAME_LINK_CONDITION });
  assert.deepEqual(eyebrow.condition, { kind: "expr", source: EYEBROW_FALLBACK_CONDITION });

  // Evaluate all three against every brand shape a product page can hold.
  const show = (src: string, brand: Record<string, string | null> | null) => {
    const name = brand?.name ?? null;
    const imageUrl = brand?.imageUrl ?? null;
    const href = brand?.href ?? null;
    if (src === LOGO_CONDITION) return Boolean(imageUrl && href);
    if (src === NAME_LINK_CONDITION) return Boolean(name && !imageUrl && href);
    return Boolean(name && !imageUrl && !href);
  };
  const cases: Array<[string, Record<string, string | null> | null, number]> = [
    ["no brand at all", null, 0],
    ["logo + page", { name: "Atosa", imageUrl: "/l.png", href: "/brands/atosa" }, 1],
    ["no logo, has page", { name: "Noaw", imageUrl: null, href: "/brands/noaw" }, 1],
    ["no logo, no page", { name: "Noaw", imageUrl: null, href: null }, 1],
  ];
  for (const [label, brand, expected] of cases) {
    const shown = [LOGO_CONDITION, NAME_LINK_CONDITION, EYEBROW_FALLBACK_CONDITION].filter((c) => show(c, brand));
    assert.equal(shown.length, expected, `${label}: expected ${expected} brand node(s), got ${shown.join(" + ") || "none"}`);
  }
});

test("a tree that already carries the LOGO link gains the name link beside it", () => {
  // Every live tree before this card: the logo link is in, the fallback is not.
  const once = applyBrandLogoLink(cdTemplate());
  const stripped = JSON.parse(JSON.stringify(once.tree)) as { root: Rec };
  const buy = find(stripped.root, "buy") as Rec;
  buy.children = (buy.children as Rec[]).filter((c) => c.id !== BRAND_NAME_LINK_ID);
  (find(stripped.root, BRAND_EYEBROW_ID) as Rec).condition = { kind: "expr", source: "brand.name && !brand.imageUrl" };

  const again = applyBrandLogoLink(stripped as unknown as NodeTree);
  assert.equal(again.inserted, true);
  assert.equal(again.logoInserted, false, "the logo link was already there");
  assert.equal(again.nameLinkInserted, true);
  assert.equal(again.eyebrowGuarded, true);
  assert.deepEqual(checkBrandLogoLink(again.tree), []);
  assert.deepEqual(
    ((find(again.tree.root as unknown as Rec, "buy") as Rec).children as Rec[]).map((c) => c.id),
    [BRAND_LOGO_LINK_ID, BRAND_NAME_LINK_ID, BRAND_EYEBROW_ID, "title"]
  );
});

test("a template with no brand line anchors on the product title (Industry Kitchens)", () => {
  const { tree, inserted, anchorId, eyebrowGuarded } = applyBrandLogoLink(ikTemplate());
  assert.equal(inserted, true);
  assert.equal(anchorId, "n-h1");
  assert.equal(eyebrowGuarded, false);
  assert.deepEqual(checkBrandLogoLink(tree), []);
  const buy = find(tree.root as unknown as Rec, "n-buy") as Rec;
  assert.deepEqual((buy.children as Rec[]).map((c) => c.id), [BRAND_LOGO_LINK_ID, BRAND_NAME_LINK_ID, "n-h1", "n-sku"]);

  // No eyebrow to copy styling from, so the fallback takes the default classes —
  // every one of which already appears in IK's published product tree.
  const nameLink = find(tree.root as unknown as Rec, BRAND_NAME_LINK_ID) as Rec;
  assert.equal(nameLink.tag, "a");
  assert.deepEqual(nameLink.text, [{ kind: "binding", path: "brand.name" }]);
  assert.ok((nameLink.classes as string[]).includes("inline-block"));
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
  const { inserted, anchorId, nameLinkInserted } = applyBrandLogoLink(orphan);
  assert.equal(inserted, false);
  assert.equal(nameLinkInserted, false);
  assert.equal(anchorId, null);
  assert.deepEqual(checkBrandLogoLink(orphan), ["no brand-logo-link node"]);
});

test("the shipped seed carries the link, above its brand line", () => {
  assert.deepEqual(checkBrandLogoLink(SEED_PRODUCT_TREE), []);
  const parent = parentOf(SEED_PRODUCT_TREE.root as unknown as Rec, BRAND_LOGO_LINK_ID) as Rec;
  const ids = (parent.children as Rec[]).map((c) => c.id);
  assert.equal(ids.indexOf(BRAND_LOGO_LINK_ID) + 1, ids.indexOf(BRAND_NAME_LINK_ID));
  assert.equal(ids.indexOf(BRAND_NAME_LINK_ID) + 1, ids.indexOf(BRAND_EYEBROW_ID));
  // Re-running the database pass over the seed is a no-op — the two agree.
  assert.equal(applyBrandLogoLink(SEED_PRODUCT_TREE).inserted, false);
});
