import type { NodeTree, BuilderNode } from "@keenan/services/builder";

// ============================================================================
// "1 Carton = 24 Pcs" on the AUTHORED listing tile (card O108e4jH).
//
// Tim, 2026-09-21: "Please review Zoey functionality and copy this", linking Zoey's Packaging doc.
// Zoey's CATEGORY tile carries the package: a quantity box counting cases and "3 Case(s) = 36
// Bottles" under it. Our tile has no quantity box on any product — one press of Add to Cart adds
// one, and the cart rounds that up to ONE WHOLE PACKAGE (`addToCart` → `snapToPack`) — so the
// line this tile owes the shopper is the one for a single package: what that press buys.
//
// WHY CODE AND NOT AUTHORING — the same reason, and the same seam, as `promo-tag-node.ts`: the
// live category, brand and product-rail tiles are placements of the stored `product-card` master
// (`cms_components`), so a React edit ships nothing there. This runs once at `@/lib/store`
// (`getComponents` / `getDraftComponents`), so no branch can load the master without it.
//
// DATA-DRIVEN, NOT CHANNEL-GATED. The node renders only where the row's `pack_line` is non-empty
// (`enrichProductCardRows` → `tilePackLine`, `@keenan/services/pack`), which is "" on every product
// sold individually, on a product whose package differs by customer group (a shared tile cannot
// know the shopper), and on a cached row from before the columns were selected. So the pass is
// harmless on every tile of every site, and a master with no buy row (Industry Kitchens' tile has
// none today) gets nothing, because there is no press for the line to describe.
//
// PLACEMENT: immediately before the buy row (`ctas`), i.e. after the price and after the "Buy
// more & save" tag when that pass placed one — the line sits directly on the button it explains.
// A master carrying no `ctas` layer gets NOTHING (never a line dropped over the photo).
//
// PURE + IDEMPOTENT. Same object back when there is nothing to do; an author who places a node
// with this id themselves keeps their placement.
// ============================================================================

/** The component master every storefront repeats for a listing tile. */
export const PRODUCT_CARD_KEY = "product-card";

/** The node the line is drawn by. Also the idempotency key. */
export const TILE_PACK_LINE_NODE_ID = "tile-pack-line";

/** The tile's buy row, as the seed named it and the Site Builder preserves it. */
const CTAS_LABEL = "ctas";

/** The row field `enrichProductCardRows` fills (`@keenan/services` page-payloads). */
const PACK_LINE_PATH = "props.card.pack_line";

function packLineNode(): BuilderNode {
  return {
    id: TILE_PACK_LINE_NODE_ID,
    kind: "element",
    tag: "p",
    label: "pack-line",
    classes: ["mt-2", "text-xs", "font-medium", "text-zinc-700"],
    text: [{ kind: "binding", path: PACK_LINE_PATH }],
    condition: { kind: "expr", source: PACK_LINE_PATH },
  };
}

function anyChildOf(node: BuilderNode): BuilderNode[] {
  if (node.kind === "element") return node.children ?? [];
  if (node.kind === "repeat") return [...(node.children ?? []), ...(node.emptyChildren ?? [])];
  return [];
}

function hasNode(node: BuilderNode, id: string): boolean {
  if (node.id === id) return true;
  return anyChildOf(node).some((child) => hasNode(child, id));
}

/** The element whose OWN children carry `label`, and that child's index. Elements only. */
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

/** The tile master with the pack line before its buy row, or the SAME tree when it has none. */
export function withTilePackLine(tree: NodeTree): NodeTree {
  if (hasNode(tree.root, TILE_PACK_LINE_NODE_ID)) return tree;
  const ctas = findParentOfLabel(tree.root, CTAS_LABEL);
  if (!ctas) return tree;
  return { ...tree, root: spliceInto(tree.root, ctas.parent, ctas.index, packLineNode()) };
}

/** The component map with the line on its tile master; the SAME map when nothing changed. */
export function withTilePackLineInComponents(
  components: Record<string, NodeTree>
): Record<string, NodeTree> {
  const tile = components?.[PRODUCT_CARD_KEY];
  if (!tile || !(tile as NodeTree).root) return components;
  const next = withTilePackLine(tile);
  if (next === tile) return components;
  return { ...components, [PRODUCT_CARD_KEY]: next };
}
