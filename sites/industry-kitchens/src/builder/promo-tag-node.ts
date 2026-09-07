import type { NodeTree, BuilderNode } from "@keenan/services/builder";

// ============================================================================
// The "Buy more & save" tag on the AUTHORED listing tile (card FNYihLHk).
//
// WHY CODE AND NOT AUTHORING. An AUTHORED page renders from a node tree stored
// in the database, and its tiles are placements of the `product-card` COMPONENT
// master (`cms_components`), not the React `ProductCard`. Verified live on
// 2026-08-25: chefsdepot.com.au/categories/* serves `data-node-id="cmp-seed-17"`
// tiles and a Chefs Depot PRODUCT page repeats the very same master for its
// "You may also like" rail, while the home rails, /products, /clearance,
// /search and /brands/* still serve the React card. So editing ProductCard.tsx
// alone ships the tag on some of our own screens and not on others, for the
// same product.
//
// WHERE IT IS APPLIED. Once, at `@/lib/store`, which wraps `getComponents` /
// `getDraftComponents` — the single read every node branch and every authored
// route goes through (category, brand, home, product, `/pages/[slug]`). That is
// the seam card tSrCcnvx used for the Industry Kitchens brand-logo fallback, and
// it is the reason there is no "which branch did we remember" question: a branch
// cannot load a master without the tag on it. Wiring one branch instead covers
// the happy path only, and the page next door disagrees with it.
//
// Placing it at render time is the same choice — and the same shape — as the
// illustrative-image banner (82HgV23q), the SilverChef panel (6f47rFeT) and the
// upsell rail (fYqTM5Ot): nothing is written to the stored trees, so a rollback
// has nothing to undo, the Site Builder's saved design is not touched, and an
// author who places the tag themselves keeps their placement.
//
// CHANNEL-GATED BY DATA, NOT BY A CHANNEL ID. This module is shared and
// byte-identical across `template/` and every site, so it must not know which
// storefront it is running on. It takes the wording as an ARGUMENT and inserts
// nothing when that wording is null. The decision lives in each site's own
// `lib/promo-tag.ts`, which is deliberately NOT a shared module: Chefs Depot
// names its tag there, `template/` and Industry Kitchens hold null.
//
// PURE + IDEMPOTENT. Returns the SAME object when there is nothing to do, so the
// common path allocates nothing and running twice changes nothing.
// ============================================================================

/** The component master every storefront repeats for a listing tile. */
export const PRODUCT_CARD_KEY = "product-card";

/** The node the tag is drawn by. Also the idempotency key. */
export const PROMO_TAG_NODE_ID = "promo-tag";

/**
 * The tile's own layer names, as the seed wrote them and as the Site Builder
 * preserves them through edits and component extraction. The tag goes directly
 * ABOVE the buy row, which is what puts it under the brand, name and price the
 * way the card's mock shows.
 */
const CTAS_LABEL = "ctas";
const PRICE_LABEL = "price-wrap";

/**
 * The pill. A `<span>` inside a `<p>` rather than a bare span, so it sits on its
 * own line under the price instead of running into the buy row.
 *
 * `badge-promo` is a component class in each site's own stylesheet, not a
 * utility: a class that appears in a stored tree may only be one the deployed
 * CSS already carries (the rule the brand-intro paragraphs are bound by), and a
 * class we merely composed here could be purged on a site that never names it in
 * source. Nothing is stored either way — this node is built per render — but the
 * same rule decides whether it renders as anything.
 */
function pillNode(label: string): BuilderNode {
  return {
    id: PROMO_TAG_NODE_ID,
    kind: "element",
    tag: "p",
    label: "promo-tag",
    classes: ["mt-3"],
    children: [
      {
        id: `${PROMO_TAG_NODE_ID}-pill`,
        kind: "element",
        tag: "span",
        label: "badge-promo",
        classes: ["badge-promo"],
        text: [{ kind: "static", value: label }],
      },
    ],
  };
}

/** Every child, repeat subtrees included — only ever used to ask "is it here?". */
function anyChildOf(node: BuilderNode): BuilderNode[] {
  if (node.kind === "element") return node.children ?? [];
  if (node.kind === "repeat") return [...(node.children ?? []), ...(node.emptyChildren ?? [])];
  return [];
}

function hasNode(node: BuilderNode, id: string): boolean {
  if (node.id === id) return true;
  return anyChildOf(node).some((child) => hasNode(child, id));
}

/**
 * The element whose OWN children carry `label`, plus that child's index.
 *
 * Only an element's children are searched. A repeat's children are one item
 * subtree rendered per row, and a tile master has none — but the restriction is
 * what stops a future master with a spec-list repeat from anchoring the tag
 * inside a bullet.
 */
function findParentOfLabel(
  node: BuilderNode,
  label: string
): { parent: BuilderNode; index: number } | null {
  if (node.kind !== "element") return null;
  const kids = node.children ?? [];
  const index = kids.findIndex((k) => k.label === label);
  if (index >= 0) return { parent: node, index };
  for (const kid of kids) {
    const hit = findParentOfLabel(kid, label);
    if (hit) return hit;
  }
  return null;
}

/** Copy of `node` with `insert` spliced into `parent`'s children at `index`. */
function spliceInto(
  node: BuilderNode,
  parent: BuilderNode,
  index: number,
  insert: BuilderNode
): BuilderNode {
  if (node.kind !== "element") return node;
  const kids = node.children ?? [];
  if (node === parent) {
    const next = [...kids];
    next.splice(index, 0, insert);
    return { ...node, children: next };
  }
  return { ...node, children: kids.map((k) => spliceInto(k, parent, index, insert)) };
}

/**
 * The tile master with the tag in it, or the SAME tree when it cannot be placed.
 *
 * Two anchors, tried in order: immediately before the buy row, else immediately
 * after the price block. A master carrying neither layer gets NOTHING — the card
 * asks for a tag under the price, and a tag dropped at the top of a tile, over
 * the photo, or under the Add to Cart button is not that. A re-authored master
 * that renames both layers therefore loses the tag silently, which is recorded
 * on `sf-catalog-browse` rather than papered over with a guess.
 */
export function withPromoTag(tree: NodeTree, label: string): NodeTree {
  if (hasNode(tree.root, PROMO_TAG_NODE_ID)) return tree;

  const beforeCtas = findParentOfLabel(tree.root, CTAS_LABEL);
  if (beforeCtas) {
    return {
      ...tree,
      root: spliceInto(tree.root, beforeCtas.parent, beforeCtas.index, pillNode(label)),
    };
  }

  const afterPrice = findParentOfLabel(tree.root, PRICE_LABEL);
  if (afterPrice) {
    return {
      ...tree,
      root: spliceInto(tree.root, afterPrice.parent, afterPrice.index + 1, pillNode(label)),
    };
  }

  return tree;
}

/**
 * The component map a listing page renders with, with the tag on its tile.
 *
 * `label` null — every site but Chefs Depot today — returns the map untouched,
 * which is the channel gate: no wording, no node, no tag.
 */
export function withPromoTagInComponents(
  components: Record<string, NodeTree>,
  label: string | null
): Record<string, NodeTree> {
  if (!label) return components;
  const tile = components[PRODUCT_CARD_KEY];
  if (!tile) return components;
  const next = withPromoTag(tile, label);
  if (next === tile) return components;
  return { ...components, [PRODUCT_CARD_KEY]: next };
}
