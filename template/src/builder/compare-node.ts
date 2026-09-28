import type { NodeTree, BuilderNode } from "@keenan/services/builder";

// ============================================================================
// Placing "Add to Compare" on the live product page (IK parity plan decision 12,
// root cause `compare-feature`).
//
// WHERE. The old Industry Kitchens page put "Add to Compare" / "View Compare"
// and the "COMPARE PRODUCTS HERE" button directly UNDER the buy buttons. So the
// leaf goes in as the NEXT SIBLING of the buy row (`actions-row`, the component
// both live trees place — IK page 69 holds it between `option-selector` and the
// clearance block). A tree with no buy row gets it at the end of the root:
// visible rather than silently lost.
//
// WHO. The pass is ENGINE (shared, byte-identical in every tree) but the feature
// is Industry Kitchens' alone: it runs only where the site's own switch,
// `lib/compare-site.ts` (`COMPARE_ENABLED`), says so, and only that site
// registers the `product-compare` native. Chefs Depot's switch is off, so its
// page is returned untouched — by reference.
//
// AUTHOR FIRST. The leaf is a sealed native under a stable key, so the template
// lane can place it in the stored product template (or inside a master) like any
// other component node. When the key is already placed ANYWHERE — the page tree
// or any master the page places, whatever the node's id — this pass
// leaves the author's placement alone and adds nothing.
//
// PURE. Never mutates the stored tree (the branch caches it and the portal
// editor reads the same object).
// ============================================================================

/** The native key, and the id the pass gives the node it places. */
export const COMPARE_NODE_KEY = "product-compare";

function compareNode(): BuilderNode {
  return { id: COMPARE_NODE_KEY, kind: "component", componentKey: COMPARE_NODE_KEY };
}

/** Every child, repeat subtrees included — only ever used to ask "is it already here?". */
function anyChildOf(node: BuilderNode): BuilderNode[] {
  if (node.kind === "element") return node.children ?? [];
  if (node.kind === "repeat") return [...(node.children ?? []), ...(node.emptyChildren ?? [])];
  return [];
}

/**
 * Whether `node` places the leaf — itself, anywhere below it, or inside a master
 * it references (followed through the library, each master once), so a leaf the
 * author put in `actions-row` counts while one put in an unrelated master, such
 * as a category tile, does not.
 */
function placesKey(
  node: BuilderNode,
  components: Record<string, NodeTree | null | undefined>,
  seen: Set<string>
): boolean {
  if (node.id === COMPARE_NODE_KEY) return true;
  if (node.kind === "component") {
    if (node.componentKey === COMPARE_NODE_KEY) return true;
    const key = node.componentKey;
    if (key && !seen.has(key)) {
      seen.add(key);
      const master = components[key];
      if (master?.root && placesKey(master.root, components, seen)) return true;
    }
  }
  return anyChildOf(node).some((child) => placesKey(child, components, seen));
}

/** Only an element's children are searched and spliced — never a repeat's per-row subtree. */
function openChildrenOf(node: BuilderNode): BuilderNode[] {
  return node.kind === "element" ? (node.children ?? []) : [];
}

function isActionsRow(node: BuilderNode): boolean {
  return node.kind === "component" && node.componentKey === "actions-row";
}

function findActionsRow(node: BuilderNode): { parent: BuilderNode; child: BuilderNode } | null {
  for (const child of openChildrenOf(node)) if (isActionsRow(child)) return { parent: node, child };
  for (const child of openChildrenOf(node)) {
    const hit = findActionsRow(child);
    if (hit) return hit;
  }
  return null;
}

function insertAfter(node: BuilderNode, parent: BuilderNode, child: BuilderNode): BuilderNode {
  if (node.kind !== "element") return node;
  const kids = node.children ?? [];
  if (node === parent) {
    const next = [...kids];
    const index = kids.indexOf(child);
    next.splice(index < 0 ? next.length : index + 1, 0, compareNode());
    return { ...node, children: next };
  }
  return { ...node, children: kids.map((k) => insertAfter(k, parent, child)) };
}

export interface CompareNodeOptions {
  /** The site's `COMPARE_ENABLED`. False returns the tree untouched. */
  enabled: boolean;
  /** The component library the page renders with — an author may have placed the leaf in one of
   *  the masters this page places (e.g. inside `actions-row`). */
  components?: Record<string, NodeTree | null | undefined> | null;
}

/**
 * The product tree with the compare control directly below the buy row. Returns
 * the SAME object when the site has no compare feature or the leaf is already
 * placed, so the common path allocates nothing.
 */
export function withCompareNode(tree: NodeTree, opts: CompareNodeOptions): NodeTree {
  if (!opts.enabled) return tree;
  if (placesKey(tree.root, opts.components ?? {}, new Set())) return tree;

  const hit = findActionsRow(tree.root);
  if (hit) return { ...tree, root: insertAfter(tree.root, hit.parent, hit.child) };

  if (tree.root.kind === "element") {
    return { ...tree, root: { ...tree.root, children: [...openChildrenOf(tree.root), compareNode()] } };
  }
  return tree;
}
