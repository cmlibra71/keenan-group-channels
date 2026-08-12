import type { NodeTree, BuilderNode } from "@keenan/services/builder";

// ============================================================================
// Card CXnP1lrL — "Remove in stock".
//
// The storefronts state NO stock status. Taking the wording out of the source
// (builder/seeds/product.ts, ProductDetail.tsx, ProductCard.tsx) is only half
// the job: a template or component that was authored in the Site Builder keeps
// its OWN copy of the tree in the database, and the stored copy is what renders
// live — the seed is merely the fallback for a site that never authored one.
//
// This is the pure half of the database cleanup: given a stored tree, drop the
// stock-status nodes wherever they sit. `scripts/strip-stock-wording.mts` is the
// runner that applies it. Keeping the rule here rather than inline in the script
// is what makes it testable, and what lets a re-forked site run the same pass.
// ============================================================================

/**
 * Node ids the seed used for the product page's stock status. Ids are stable
 * across the seed and every tree authored from it — the Site Builder preserves
 * them through edits and through component extraction, so matching on the id is
 * exact where matching on copy would miss a retyped label.
 *
 * - `ships-note`  — "Ships to order — Add to Cart or Add to Quote and we'll
 *                    confirm delivery timing."
 * - `trust-stock` — the trust-row chip; its two branches carry "In stock" and
 *                    "Check availability", so removing the parent takes both.
 */
export const STOCK_NODE_IDS = ["ships-note", "trust-stock"] as const;

/**
 * The listing tile's stock tag is a different problem: it lives in the
 * `product-card` COMPONENT master, whose nodes carry generated ids
 * (`span-cseed-10`) that mean nothing and are not stable between channels. It is
 * identified instead by the thing that actually defines it — the badge class the
 * stylesheet dropped with this card, or the literal label.
 */
export const LOW_STOCK_CLASS = "badge-stock-low";
export const LOW_STOCK_LABEL = "Low Stock";

/** Every wording this card removes; used as the post-condition on a cleaned tree. */
export const STOCK_WORDINGS = ["In stock", "Check availability", "Ships to order", LOW_STOCK_LABEL] as const;

/** Copy of a tree with the stock-status nodes removed, plus what was removed. */
export interface StripResult {
  tree: NodeTree;
  /** Ids actually found and dropped, in tree order. Empty = already clean. */
  removed: string[];
}

// The walk is structural, not variant-aware: `BuilderNode` is a union whose
// members differ in which child arrays they carry (a CodeNode has none), so the
// transform reads them off a plain-record view and only the two node-list keys
// the builder uses are ever rewritten. Everything else is copied through byte
// for byte, which is what keeps an authored tree's component instances, styles
// and bindings intact.
type NodeRecord = Record<string, unknown> & { id?: unknown };
const CHILD_KEYS = ["children", "emptyChildren"] as const;

/** The node's OWN static text, ignoring anything its descendants say. */
function ownText(node: NodeRecord): string {
  const parts = node.text;
  if (!Array.isArray(parts)) return "";
  return parts
    .map((p) => (p && typeof p === "object" && "value" in p ? String((p as { value: unknown }).value ?? "") : ""))
    .join("")
    .trim();
}

function isLowStockBadge(node: NodeRecord): boolean {
  const classes = node.classes;
  if (Array.isArray(classes) && classes.includes(LOW_STOCK_CLASS)) return true;
  return ownText(node) === LOW_STOCK_LABEL;
}

function shouldRemove(node: NodeRecord, doomedIds: Set<string>): boolean {
  if (typeof node.id === "string" && doomedIds.has(node.id)) return true;
  return isLowStockBadge(node);
}

function stripNode(node: NodeRecord, doomedIds: Set<string>, removed: string[]): NodeRecord {
  const next: NodeRecord = { ...node };
  for (const key of CHILD_KEYS) {
    const kids = node[key];
    if (!Array.isArray(kids)) continue;
    const kept: NodeRecord[] = [];
    for (const child of kids as NodeRecord[]) {
      if (child && typeof child === "object" && shouldRemove(child, doomedIds)) {
        removed.push(typeof child.id === "string" ? child.id : "(unnamed)");
        continue;
      }
      kept.push(stripNode(child, doomedIds, removed));
    }
    next[key] = kept;
  }
  return next;
}

/**
 * Remove the stock-status nodes from a stored tree — a product template or a
 * component master; the same pass handles both.
 *
 * Pure and idempotent: a tree that never had them (Industry Kitchens' product
 * template was authored clean) comes back with `removed: []`, so the runner can
 * be re-run safely and an already-clean channel is a no-op rather than an error.
 */
export function stripStockNodes(
  tree: NodeTree,
  ids: readonly string[] = STOCK_NODE_IDS
): StripResult {
  const doomedIds = new Set(ids);
  const removed: string[] = [];
  // The root itself is never a stock node (it is the page or the component), so
  // only its descendants are considered — matching how the seed nests them.
  const root = stripNode(tree.root as unknown as NodeRecord, doomedIds, removed);
  return { tree: { ...tree, root: root as unknown as BuilderNode } as NodeTree, removed };
}

/**
 * Which of the removed wordings still appear anywhere in a tree. The runner uses
 * this as its post-condition: id and class matching is the mechanism, but "no
 * stock words survive" is the actual acceptance criterion, and a designer who
 * retyped the copy into some other node would defeat both.
 */
export function findStockWording(tree: NodeTree): string[] {
  const json = JSON.stringify(tree);
  return STOCK_WORDINGS.filter((w) => json.includes(w));
}
