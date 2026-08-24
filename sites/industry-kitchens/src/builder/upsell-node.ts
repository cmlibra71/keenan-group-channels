import type { NodeTree, BuilderNode } from "@keenan/services/builder";

// ============================================================================
// The UPSELL rail on the live product page (card fYqTM5Ot).
//
// THE BUG. `product_upsells` holds 7,095 rows with kind='upsell' and 2,944
// products carry `products.upsell_product_ids`, and NOTHING on the page read
// them: both storefronts render exactly one card rail, bound to
// `related.products`. Zoey — the oracle — shows upsells as their OWN block,
// headed "You may also be interested in the following product(s)", separate
// from related items (verified 2026-08-24 against the card's IK reference page,
// which is still served by Zoey).
//
// WHY CODE AND NOT AUTHORING. Both channels render this page from an AUTHORED
// node tree stored in the database (`docs/behaviour/catalogue.md` >
// sf-product-page; cards CXnP1lrL / uzeXShZu), so editing `seeds/product.ts`
// ships nothing a customer can see. Same choice, and the same shape, as the
// SilverChef panel (6f47rFeT) and the illustrative-image banner (82HgV23q):
// placed at render time, nothing written to the stored trees, so a rollback has
// nothing to undo and an author who builds the block themselves keeps theirs.
//
// WHY A CLONE OF THE RELATED BLOCK, rather than an authored subtree of our own.
// Two reasons, both rules on that surface:
//   1. "Classes used in a stored tree must already exist in the deployed
//      stylesheet." A hand-written block would invent markup whose classes are
//      only guaranteed on the site we tested. Cloning reuses, exactly, whatever
//      that site already ships.
//   2. The card asks for "the same tile component the related block uses", so
//      the listing-tile rules still hold — no stock wording, Add to Cart
//      affordances intact, out-of-stock still buyable as a back order. Chefs
//      Depot's rail repeats a `product-card` COMPONENT and Industry Kitchens'
//      repeats its own; cloning gets each site its own tile for free, and
//      `guardBuyControls` keeps treating them as tiles because a tile names the
//      product it buys (`card.id`), which the clone does not change.
//
// The clone swaps three things and nothing else: the block's condition and the
// repeat's source move from `related.` to `upsell.`, and the heading text
// becomes Zoey's wording. Every id is re-prefixed so the two blocks cannot
// collide in the DOM or in the editor's selection model.
//
// NO HEADING, NO BLOCK. If the related block carries no heading we can rename,
// we insert nothing: a second, unlabelled rail of products directly above "You
// may also like" reads as a repeat of it, which is worse than the bug.
//
// PURE + IDEMPOTENT. Returns the SAME tree object when there is nothing to do.
// ============================================================================

/** Zoey's own wording for this block. Do not paraphrase — see the card. */
export const UPSELL_HEADING = "You may also be interested in the following product(s)";

/** The rail we clone. */
const RELATED_SOURCE = "related.products";
/** The rail we produce. */
const UPSELL_SOURCE = "upsell.products";

/** Every id in the clone gets this prefix, so the two rails never collide. */
const ID_PREFIX = "upsell-";

/** Every child, repeat subtrees included — only ever used to ask "is it here?". */
function anyChildOf(node: BuilderNode): BuilderNode[] {
  if (node.kind === "element") return node.children ?? [];
  if (node.kind === "repeat") return [...(node.children ?? []), ...(node.emptyChildren ?? [])];
  return [];
}

/** True when this tree already has an upsell rail (an author built one, or we ran twice). */
function hasUpsellRail(node: BuilderNode): boolean {
  if (node.kind === "repeat" && node.source === UPSELL_SOURCE) return true;
  return anyChildOf(node).some(hasUpsellRail);
}

/**
 * The children we may SEARCH: an element's and a repeat's alike here, because we
 * are looking for the related repeat itself rather than for a place to insert.
 * The INSERT point is always an element's child list (see `insertBefore`).
 */
function pathToRelatedRepeat(node: BuilderNode, trail: BuilderNode[]): BuilderNode[] | null {
  if (node.kind === "repeat" && node.source === RELATED_SOURCE) return [...trail, node];
  for (const child of anyChildOf(node)) {
    const hit = pathToRelatedRepeat(child, [...trail, node]);
    if (hit) return hit;
  }
  return null;
}

/** Does this condition read the related slice? */
function readsRelated(node: BuilderNode): boolean {
  const c = node.condition;
  if (!c) return false;
  if (c.kind === "data") return c.path.startsWith("related.");
  if (c.kind === "expr") return c.source.includes("related.");
  return false;
}

/** `related.x` → `upsell.x`, anywhere in a path or an expression. */
const reslice = (s: string): string => s.split("related.").join("upsell.");

function recondition(node: BuilderNode): BuilderNode["condition"] {
  const c = node.condition;
  if (!c) return undefined;
  if (c.kind === "data") return { ...c, path: reslice(c.path) };
  if (c.kind === "expr") return { ...c, source: reslice(c.source) };
  return c;
}

/** Deep copy with re-prefixed ids, `related.` re-sliced to `upsell.`. */
function cloneForUpsell(node: BuilderNode): BuilderNode {
  const base = { ...node, id: `${ID_PREFIX}${node.id}` } as BuilderNode;
  if (node.condition) base.condition = recondition(node);

  if (base.kind === "repeat") {
    return {
      ...base,
      source: base.source === RELATED_SOURCE ? UPSELL_SOURCE : reslice(base.source),
      children: (node as typeof base).children.map(cloneForUpsell),
      emptyChildren: (node as typeof base).emptyChildren?.map(cloneForUpsell),
    };
  }
  if (base.kind === "element") {
    const el = node as Extract<BuilderNode, { kind: "element" }>;
    return {
      ...base,
      children: el.children?.map(cloneForUpsell),
      state: el.state?.map((s) => ({ ...s })),
    };
  }
  return base;
}

/**
 * The first heading INSIDE the cloned block but OUTSIDE its repeat — the rail's
 * own title, never a product name inside a card.
 */
function findHeading(node: BuilderNode): Extract<BuilderNode, { kind: "element" }> | null {
  if (node.kind === "repeat") return null;
  if (node.kind === "element") {
    if (/^h[1-6]$/i.test(node.tag)) return node;
    for (const child of node.children ?? []) {
      const hit = findHeading(child);
      if (hit) return hit;
    }
  }
  return null;
}

/** Copy of `node` with the heading's text replaced by Zoey's wording. */
function retitle(node: BuilderNode, heading: BuilderNode): BuilderNode {
  if (node === heading && node.kind === "element") {
    return { ...node, text: [{ kind: "static", value: UPSELL_HEADING }], richBinding: undefined };
  }
  if (node.kind === "element" && node.children) {
    return { ...node, children: node.children.map((c) => retitle(c, heading)) };
  }
  return node;
}

/** Copy of `tree.root` with `block` spliced in immediately before `child` of `parent`. */
function insertBefore(node: BuilderNode, parent: BuilderNode, child: BuilderNode, block: BuilderNode): BuilderNode {
  if (node.kind !== "element") return node;
  const kids = node.children ?? [];
  if (node === parent) {
    const index = kids.indexOf(child);
    const next = [...kids];
    next.splice(index < 0 ? kids.length : index, 0, block);
    return { ...node, children: next };
  }
  return { ...node, children: kids.map((k) => insertBefore(k, parent, child, block)) };
}

/**
 * The product tree with an upsell rail above the related rail.
 *
 * Returns the SAME tree object when there is nothing to add — no related rail
 * to clone, no wrapper that owns it, or no heading to rename.
 */
export function withUpsellBlock(tree: NodeTree): NodeTree {
  if (hasUpsellRail(tree.root)) return tree;

  const path = pathToRelatedRepeat(tree.root, []);
  if (!path || path.length < 3) return tree;

  // The BLOCK is the outermost ancestor whose own condition reads the related
  // slice — the wrapper the author put the whole rail (heading included) inside,
  // so that a product with no related items renders no heading. Chefs Depot:
  // `related-wrap` (condition kind "data"). Industry Kitchens: the equivalent
  // wrapper with an "expr" condition. Without such a wrapper there is no block
  // to clone — only a bare repeat — and we leave the tree alone.
  let blockIndex = -1;
  for (let i = 0; i < path.length - 1; i++) {
    if (readsRelated(path[i])) {
      blockIndex = i;
      break;
    }
  }
  if (blockIndex < 1) return tree;

  const block = path[blockIndex];
  const parent = path[blockIndex - 1];
  if (parent.kind !== "element") return tree;

  const clone = cloneForUpsell(block);
  const heading = findHeading(clone);
  if (!heading) return tree;

  return { ...tree, root: insertBefore(tree.root, parent, block, retitle(clone, heading)) };
}
