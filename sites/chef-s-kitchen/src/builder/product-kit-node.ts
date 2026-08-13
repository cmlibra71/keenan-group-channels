import type { NodeTree, BuilderNode } from "@keenan/services/builder";

// ============================================================================
// Card 7bmpuqei — the kit block on the page a customer actually gets.
//
// Same problem as `brand-logo-link.ts` and `strip-stock-nodes.ts`: both storefronts render the
// product page from the AUTHORED tree in the database, so a new sealed leaf registered in
// `product-natives.tsx` renders nowhere until a node with its key exists in that tree. Leaving
// that as "an authoring step in the Site Builder" means a grouped kit ships with a single price
// and no statement of what the price covers, and a bundle ships with no choices — which is the
// whole content of the card.
//
// So the node is put in by CODE, at render time, in `product-node-branch.tsx`:
//
//   - No database write, so nothing depends on a script being run in the right order against
//     production, and nothing is left behind if this is rolled back.
//   - Idempotent by node id: an author who drops the `product-kit` node into the buy box in the
//     Site Builder gets THEIR placement, and this adds nothing.
//   - Safe on every product: the leaf renders null when the product is not a kit (the vast
//     majority), so the injected node is invisible on an ordinary product page.
//
// Placement is the buy box's actions row — the block sits directly above Add to Cart / Add to
// Quote, which is where "What's included" belongs on a grouped kit and where the choice pickers
// must be on a bundle (you choose, then you ask). Live trees carry the actions row as a MASTER
// INSTANCE (`componentKey: "actions-row"`, channel 1 page 69 / channel 2 page 71) and the seed
// carries it as an element with that id, so both are matched, with the first node carrying an
// addToCart/addToQuote action as the last-resort anchor.
// ============================================================================

/** Node id and native key. The id is also the idempotency marker. */
export const PRODUCT_KIT_NODE_ID = "product-kit";
export const PRODUCT_KIT_NATIVE_KEY = "product-kit";

/** The actions row, however this tree happens to express it. */
const ACTIONS_ROW_KEY = "actions-row";
const BUY_ACTION_REFS = ["addToCart", "addToQuote"];

/** The sealed-leaf node: grouped contents / bundle choice groups, rendered by `product-natives`. */
export function productKitNode(): BuilderNode {
  return {
    id: PRODUCT_KIT_NODE_ID,
    kind: "component",
    componentKey: PRODUCT_KIT_NATIVE_KEY,
    label: "Kit contents / bundle choices (native)",
  } as BuilderNode;
}

export interface ProductKitNodeResult {
  tree: NodeTree;
  /** False when the tree already carried the node, or has no buy box to anchor on. */
  inserted: boolean;
  /** Id of the node it was inserted BEFORE. */
  anchorId: string | null;
}

// Structural walk over a plain-record view of the tree, exactly as brand-logo-link.ts does:
// `BuilderNode` is a union whose members carry different child arrays, and everything this does
// not touch is copied through unchanged so component instances, styles and bindings survive.
type NodeRecord = Record<string, unknown> & { id?: unknown };
const CHILD_KEYS = ["children", "emptyChildren"] as const;

function eachChild(node: NodeRecord, fn: (child: NodeRecord) => void) {
  for (const key of CHILD_KEYS) {
    const kids = node[key];
    if (!Array.isArray(kids)) continue;
    for (const child of kids as NodeRecord[]) {
      if (child && typeof child === "object") fn(child);
    }
  }
}

function hasNode(node: NodeRecord, id: string): boolean {
  if (node.id === id) return true;
  let found = false;
  eachChild(node, (child) => {
    if (!found && hasNode(child, id)) found = true;
  });
  return found;
}

/**
 * True when THIS node itself fires the cart or quote action — the buy button.
 *
 * Deliberately not "contains one anywhere below": every ancestor up to the page root contains a
 * buy button, so a contains-check would anchor the block above the whole page. Matching the button
 * itself puts the block immediately before it, which is the correct order even when it lands
 * inside the row.
 */
function firesBuyAction(node: NodeRecord): boolean {
  const events = node.events;
  if (!Array.isArray(events)) return false;
  for (const ev of events as Array<Record<string, unknown>>) {
    const action = ev && typeof ev === "object" ? (ev.action as Record<string, unknown> | undefined) : undefined;
    if (action && typeof action.ref === "string" && BUY_ACTION_REFS.includes(action.ref)) return true;
  }
  return false;
}

/** The actions row: a master instance keyed `actions-row`, or the seed's element of that id. */
function isActionsRow(node: NodeRecord): boolean {
  return node.componentKey === ACTIONS_ROW_KEY || node.id === ACTIONS_ROW_KEY;
}

function insert(
  node: NodeRecord,
  matches: (child: NodeRecord) => boolean,
  state: { done: boolean; anchorId: string | null }
): NodeRecord {
  const next: NodeRecord = { ...node };
  for (const key of CHILD_KEYS) {
    const kids = node[key];
    if (!Array.isArray(kids)) continue;
    const out: NodeRecord[] = [];
    for (const child of kids as NodeRecord[]) {
      if (!child || typeof child !== "object") {
        out.push(child);
        continue;
      }
      if (!state.done && matches(child)) {
        state.done = true;
        state.anchorId = typeof child.id === "string" ? child.id : "(unnamed)";
        out.push(productKitNode() as unknown as NodeRecord);
        out.push(child);
        continue;
      }
      out.push(insert(child, matches, state));
    }
    next[key] = out;
  }
  return next;
}

/**
 * A copy of the tree with the kit leaf immediately above the buy box.
 *
 * Pure and idempotent: a tree that already carries a `product-kit` node comes back untouched, and
 * a tree with no recognisable buy box is reported (`inserted: false`) rather than guessed at — a
 * kit block dropped at the bottom of an unknown layout would be worse than none.
 */
export function withProductKitNode(tree: NodeTree): ProductKitNodeResult {
  const root = tree.root as unknown as NodeRecord;
  if (hasNode(root, PRODUCT_KIT_NODE_ID)) return { tree, inserted: false, anchorId: null };

  for (const matches of [isActionsRow, firesBuyAction]) {
    const state = { done: false, anchorId: null as string | null };
    const nextRoot = insert(root, matches, state);
    if (state.done) {
      return {
        tree: { ...tree, root: nextRoot as unknown as BuilderNode } as NodeTree,
        inserted: true,
        anchorId: state.anchorId,
      };
    }
  }
  return { tree, inserted: false, anchorId: null };
}
