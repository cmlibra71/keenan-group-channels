import { withAnswerRequiredTiles, type NodeTree } from "@keenan/services/builder";

// ============================================================================
// Industry Kitchens only — a stored TEMPLATE doc (product page / category layout) with its node
// tree passed through `withAnswerRequiredTiles` (services `builder/answer-required-tiles.ts`):
// a tile whose product asks a REQUIRED question, default or not (`<row>.answer_required`), offers
// "View Details" and no buy buttons, as Zoey's tile does. Wired in `lib/store.ts`
// `getCmsTemplate`; Chefs Depot never calls it. Render-time only — the SAME doc comes back when
// nothing on the tree is a tile, and nothing is ever written to the stored template.
// ============================================================================

export function withAnswerRequiredTilesInDoc<T>(doc: T): T {
  const tree = (doc as { node_tree?: unknown } | null)?.node_tree as NodeTree | null | undefined;
  if (!tree || typeof tree !== "object" || !(tree as NodeTree).root) return doc;
  const next = withAnswerRequiredTiles(tree);
  return next === tree ? doc : ({ ...(doc as object), node_tree: next } as T);
}
