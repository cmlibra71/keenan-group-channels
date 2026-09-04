import type { NodeTree, BuilderNode } from "@keenan/services/builder";

// ============================================================================
// Putting the per-category attribute filters and the price SLIDER on an
// AUTHORED category rail (card C8G4f4U8, reopened by Steve 2026-08-25).
//
// WHAT BROKE. C8G4f4U8 shipped the per-category attribute sections and the
// price slider in the SEALED React rail (`components/category/FilterRail.tsx`).
// Chefs Depot rendered its category page from that rail, so they were live.
// On 2026-08-25 Chefs Depot's `category_layout` node template was published and
// `node_category_template_enabled` turned on for channel 2, so the page began
// rendering from the AUTHORED tree instead — and that tree's `filter-rail`
// master binds `listing.facets.subcategories` / `.brands` / `.price` /
// `.availability` and nothing else. Every attribute section and the price
// slider disappeared the same day, which is exactly what Steve reported on
// https://chefsdepot.com.au/categories/underbench-and-counter-refrigeration
// (949 products, 254 of them carrying `doors` — the facet qualifies easily; it
// was simply never rendered). Industry Kitchens had been in that state since
// the feature shipped, disclosed as the "authored-tree limitation".
//
// WHY CODE AND NOT AUTHORING. Which attributes a category offers is decided
// from that category's own data (Steve, 2026-08-05: the site auto-assigns them,
// "otherwise it would be too much work"). An author cannot place a section per
// attribute per category — there are 4,000+ categories and twelve possible
// attributes — so the rail has to grow the sections it is given at render time.
// Same choice, and the same shape, as the illustrative-image banner
// (`product-image-notice.ts`, card 82HgV23q): a pure idempotent pass that
// places SEALED leaves in the tree the branch is about to render. Nothing is
// written to the stored tree, so a rollback has nothing to undo, the Site
// Builder still shows the author their own design, and an author who places
// either leaf themselves keeps THEIR placement.
//
// WHAT IT PLACES.
//  1. `category-attribute-facets` — every attribute section this category
//     earned, appended AFTER the last authored facet group so the attribute
//     sections sit under Sub-category / Brand / Price, which is where the
//     register says they belong.
//  2. `facet-price-slider` — replaces the repeat over `listing.facets.price`
//     (the three legacy tick boxes) with the min–max slider Steve asked for
//     ("we don't want long lists, we just want sliders"). The authored group
//     keeps its heading, its position and its open/collapsed behaviour: only
//     the option list inside it is swapped, so NfYe3P3G's rule that heading,
//     order and collapsed come from the designed page still holds. The bands
//     keep FILTERING — the slider draws the window a band covers and the band
//     still names itself in the chips.
//
// ANCHORED STRUCTURALLY, NOT BY ID. Chefs Depot's rail master and Industry
// Kitchens' `filter-rail-content` share no node ids, so the anchor is the shape:
// the element with the most children whose subtrees repeat over
// `listing.facets.*`. A tree with no facet groups at all is returned untouched.
// ============================================================================

/** Node id + native key for the attribute sections. */
export const ATTRIBUTE_FACETS_NODE_ID = "category-attribute-facets";
/** Node id + native key for the price slider that replaces the band tick list. */
export const PRICE_SLIDER_NODE_ID = "facet-price-slider";

/** Facet collections an authored rail repeats over. */
const FACET_SOURCES = [
  "listing.facets.subcategories",
  "listing.facets.brands",
  "listing.facets.price",
  "listing.facets.availability",
];

const PRICE_SOURCE = "listing.facets.price";

function componentNode(id: string): BuilderNode {
  return { id, kind: "component", componentKey: id };
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

/** Does this subtree repeat over one of the rail's facet collections? */
function containsFacetRepeat(node: BuilderNode): boolean {
  if (node.kind === "repeat" && FACET_SOURCES.includes(node.source)) return true;
  return anyChildOf(node).some(containsFacetRepeat);
}

interface Anchor {
  parent: BuilderNode;
  /** Index AFTER which the attribute sections go. */
  lastGroupIndex: number;
  groups: number;
  depth: number;
}

/**
 * The element that holds the facet GROUPS: the one with the most children whose
 * subtrees carry a facet repeat. Deeper wins a tie, so an outer wrapper never
 * beats the card that actually lists the groups.
 */
function findGroupContainer(node: BuilderNode, depth: number, best: Anchor | null): Anchor | null {
  let winner = best;
  if (node.kind === "element") {
    const kids = node.children ?? [];
    let groups = 0;
    let lastGroupIndex = -1;
    kids.forEach((child, index) => {
      if (containsFacetRepeat(child)) {
        groups++;
        lastGroupIndex = index;
      }
    });
    if (
      groups > 0 &&
      (winner === null || groups > winner.groups || (groups === winner.groups && depth > winner.depth))
    ) {
      winner = { parent: node, lastGroupIndex, groups, depth };
    }
  }
  for (const child of anyChildOf(node)) winner = findGroupContainer(child, depth + 1, winner);
  return winner;
}

/** Copy of `node` with `insert` spliced into `parent`'s children at `index`. */
function insertAt(
  node: BuilderNode,
  parent: BuilderNode,
  index: number,
  insert: BuilderNode
): BuilderNode {
  if (node.kind === "element") {
    const kids = node.children ?? [];
    if (node === parent) {
      const next = [...kids];
      next.splice(index, 0, insert);
      return { ...node, children: next };
    }
    return { ...node, children: kids.map((k) => insertAt(k, parent, index, insert)) };
  }
  if (node.kind === "repeat") {
    return {
      ...node,
      children: (node.children ?? []).map((k) => insertAt(k, parent, index, insert)),
      ...(node.emptyChildren
        ? { emptyChildren: node.emptyChildren.map((k) => insertAt(k, parent, index, insert)) }
        : {}),
    };
  }
  return node;
}

/** Copy of `node` with every repeat over `listing.facets.price` replaced by the
 *  price-slider leaf. Structure-preserving: the group's heading, condition and
 *  collapse state are the author's and are untouched. */
function swapPriceRepeat(node: BuilderNode): BuilderNode {
  if (node.kind === "repeat") {
    if (node.source === PRICE_SOURCE) return componentNode(PRICE_SLIDER_NODE_ID);
    return {
      ...node,
      children: (node.children ?? []).map(swapPriceRepeat),
      ...(node.emptyChildren ? { emptyChildren: node.emptyChildren.map(swapPriceRepeat) } : {}),
    };
  }
  if (node.kind === "element") {
    const kids = node.children;
    if (!kids) return node;
    return { ...node, children: kids.map(swapPriceRepeat) };
  }
  return node;
}

/**
 * One rail tree with the attribute sections placed and the price bands swapped
 * for the slider. Returns the SAME object when there is nothing to do, so the
 * common path (every component that is not a rail) allocates nothing.
 */
export function withCategoryFacetNodes(tree: NodeTree): NodeTree {
  if (!tree?.root) return tree;
  if (!containsFacetRepeat(tree.root)) return tree;

  let root = tree.root;

  // 1. Attribute sections, under the last authored facet group.
  //
  // This runs BEFORE the price swap, and the order matters: the anchor is the
  // last child whose subtree repeats over `listing.facets.*`, and swapping the
  // price bands for the slider removes that repeat. Do it the other way round
  // and a rail whose LAST group is Price (Industry Kitchens') puts the
  // attribute sections above Price instead of below it — the register's rule is
  // that they sit under Sub-category / Brand / Price.
  if (!hasNode(root, ATTRIBUTE_FACETS_NODE_ID)) {
    const anchor = findGroupContainer(root, 0, null);
    if (anchor) {
      root = insertAt(
        root,
        anchor.parent,
        anchor.lastGroupIndex + 1,
        componentNode(ATTRIBUTE_FACETS_NODE_ID)
      );
    }
  }

  // 2. Price bands → slider. Skipped when the author already placed the leaf.
  if (!hasNode(root, PRICE_SLIDER_NODE_ID)) root = swapPriceRepeat(root);

  return root === tree.root ? tree : { ...tree, root };
}

/**
 * The component-master map with every FACET RAIL in it patched.
 *
 * Both live sites reach the rail through a master, but by different routes:
 * Chefs Depot's `filter-rail` carries the groups itself and its `filter-drawer`
 * places `filter-rail`; Industry Kitchens' `filter-rail` and `filter-drawer`
 * both place `filter-rail-content`, which carries the groups. Patching by SHAPE
 * — the tree that actually repeats over `listing.facets.*` — reaches the one
 * copy on each site, so the desktop rail and the mobile drawer both gain the
 * sections from a single edit and neither can gain them twice.
 */
export function withCategoryFacetComponents(
  components: Record<string, NodeTree>
): Record<string, NodeTree> {
  let changed = false;
  const out: Record<string, NodeTree> = {};
  for (const [key, tree] of Object.entries(components ?? {})) {
    const next = withCategoryFacetNodes(tree);
    if (next !== tree) changed = true;
    out[key] = next;
  }
  return changed ? out : components;
}
