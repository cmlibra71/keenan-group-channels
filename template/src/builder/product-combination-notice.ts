import type { NodeTree, BuilderNode } from "@keenan/services/builder";

// ============================================================================
// Placing the "we do not make that combination" sentence on the live product
// page — card VNh9DdYd (Chris, 2026-09-17).
//
// WHY CODE AND NOT AUTHORING. Both storefronts render the product page from an
// AUTHORED node tree stored in the database (`sf-product-page`; CXnP1lrL /
// uzeXShZu), so editing `ProductDetail.tsx` or `seeds/product.ts` ships nothing a
// customer can see. A sentence that has to appear on ANY configurable product on
// BOTH sites therefore arrives either by somebody hand-editing two stored trees,
// or by the branch placing the leaf at render time. Same choice `withImageNoticeNode`
// (82HgV23q) and `withSilverChefNode` (6f47rFeT) made: nothing is written to the
// stored trees, so a rollback has nothing to undo.
//
// ANCHOR. The card says "beside the disabled Add to Cart", so the leaf goes
// between the option pickers and the buy row. Read off the live published trees
// on 2026-09-18, both of them put those two next to each other:
//
//   Chefs Depot   (page 71, version 207)  … {id:"options"} , {componentKey:"actions-row"} …
//   Industry K.   (page 69, version 142)  … {componentKey:"option-selector"} , {componentKey:"actions-row"} …
//
// So: insert immediately BEFORE the buy row (`actions-row`), which puts it under
// the pickers and above the button on both. Failing that — a tree that authored
// its own buy row — immediately AFTER the options block, which is the same place
// by a different route. Failing both, the end of the root: visible, if not exactly
// where the card asked, which beats a sentence that quietly never renders.
//
// IDEMPOTENT BY NODE ID. An author who places `product-combination-notice`
// themselves in the Site Builder keeps THEIR placement.
//
// PURE. Never mutates the stored tree — the branch caches it and the portal
// editor reads the same object. The leaf renders NOTHING for a product with no
// options, and nothing for a combination that exists, so it is safe on every
// product page.
// ============================================================================

/** The node id and native key. `product-natives` registers the leaf under this key. */
export const COMBINATION_NOTICE_NODE_ID = "product-combination-notice";

/** Industry Kitchens' sealed option picker. */
const OPTION_SELECTOR_KEY = "option-selector";
/** The buy row on BOTH sites. */
const ACTIONS_ROW_KEY = "actions-row";
/** What an options block repeats over, whoever authored it. */
const OPTION_GROUPS_SOURCE = "purchase.optionGroups";

function noticeNode(): BuilderNode {
  return { id: COMBINATION_NOTICE_NODE_ID, kind: "component", componentKey: COMBINATION_NOTICE_NODE_ID };
}

/** Every child, repeat subtrees included — only ever used to ask "is it already here?". */
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
 * The children we may SEARCH and INSERT into: an element's, and nothing else. A
 * repeat's children are ONE item subtree rendered per row (the related rail), so
 * an anchor found in there would put the sentence inside a product card.
 */
function openChildrenOf(node: BuilderNode): BuilderNode[] {
  return node.kind === "element" ? (node.children ?? []) : [];
}

/** The buy row itself, on BOTH sites. This is the primary anchor: the card asks for the
 *  sentence "beside the disabled Add to Cart", and the buy row IS that control. */
function isActionsRow(node: BuilderNode): boolean {
  return node.kind === "component" && node.componentKey === ACTIONS_ROW_KEY;
}

/**
 * The option picker, for a tree that has one but no recognisable buy row: Industry
 * Kitchens' sealed `option-selector` leaf, or the block that repeats over
 * `purchase.optionGroups` (what Chefs Depot's authored "Configure" card is made of).
 */
function isOptionsBlock(node: BuilderNode): boolean {
  if (node.kind === "component") return node.componentKey === OPTION_SELECTOR_KEY;
  if (node.kind === "repeat") return node.source === OPTION_GROUPS_SOURCE;
  return false;
}

interface Anchor {
  parent: BuilderNode;
  child: BuilderNode;
  /** Insert AFTER the child (an options block) or BEFORE it (the buy row). */
  after: boolean;
}

/**
 * Depth-first search for a node the predicate matches, returning it WITH the element
 * that holds it — the predicate looks at one node only, never at its descendants, so
 * the anchor is the node itself rather than some wrapper several levels up.
 */
function findAnchor(
  node: BuilderNode,
  test: (n: BuilderNode) => boolean,
  after: boolean
): Anchor | null {
  for (const child of openChildrenOf(node)) {
    if (test(child)) return { parent: node, child, after };
  }
  for (const child of openChildrenOf(node)) {
    const hit = findAnchor(child, test, after);
    if (hit) return hit;
  }
  return null;
}

/** Copy of `node` with the notice spliced in next to `child` of `parent`. */
function splice(node: BuilderNode, anchor: Anchor): BuilderNode {
  if (node.kind !== "element") return node;
  const kids = node.children ?? [];
  if (node === anchor.parent) {
    const index = kids.indexOf(anchor.child);
    const next = [...kids];
    next.splice(index < 0 ? next.length : index + (anchor.after ? 1 : 0), 0, noticeNode());
    return { ...node, children: next };
  }
  return { ...node, children: kids.map((k) => splice(k, anchor)) };
}

/**
 * The product tree with the unmade-combination sentence in it.
 *
 * Returns the SAME tree object when the leaf is already placed (an author put it
 * there, or this ran twice) so the common path allocates nothing.
 */
export function withCombinationNoticeNode(tree: NodeTree): NodeTree {
  if (hasNode(tree.root, COMBINATION_NOTICE_NODE_ID)) return tree;

  const anchor =
    findAnchor(tree.root, isActionsRow, false) ?? findAnchor(tree.root, isOptionsBlock, true);
  if (anchor) return { ...tree, root: splice(tree.root, anchor) };

  // Nothing to anchor against: the end of the root.
  if (tree.root.kind === "element") {
    return { ...tree, root: { ...tree.root, children: [...openChildrenOf(tree.root), noticeNode()] } };
  }
  return tree;
}
