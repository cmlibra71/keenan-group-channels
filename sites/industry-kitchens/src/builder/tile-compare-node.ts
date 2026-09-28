import type { NodeTree, BuilderNode } from "@keenan/services/builder";

// ============================================================================
// "Add to Compare" on every listing tile — Industry Kitchens only (IK parity,
// root cause compare-feature; the old site had the link on every category tile).
//
// IK's category and brand pages draw their tiles from ONE stored master,
// `product-card`, repeated per row with the row handed in as `props.card`. A
// sealed native cannot see a repeat's row on its own, but a component node's
// PROPS are resolved against the row's scope before the native is called
// (services `NodeRenderer` › ComponentRefRenderer). So this places, per tile, a
// `tile-compare` component node whose `productId` prop is bound to
// `props.card.id` — the same binding the card's own analytics click reads.
//
// WHERE. The master's root is the tile's <a>; a control inside it would nest a
// button (or the "View Compare" link) in a link. So the root is wrapped: a
// plain <div> holding the untouched card and, after it, the compare node — the
// old site's order (tile, buttons, then the small compare link).
//
// WHO. Applied from THIS site's `lib/store.ts` master transforms, so Chefs
// Depot's masters are never touched. The native is registered only in the
// category and brand natives, so a `product-card` placed anywhere else (home
// rails, the product page's related rail — where the old site showed no compare
// link) renders the card and nothing more: an unregistered key with no master
// renders null.
//
// AUTHOR FIRST / IDEMPOTENT. A master that already places `tile-compare` is
// returned as it is. PURE: the stored master is never mutated.
// ============================================================================

/** The native key the category/brand natives register. Not a master key. */
export const TILE_COMPARE_KEY = "tile-compare";
/** The one master this rewrites. */
export const PRODUCT_CARD_KEY = "product-card";

function placesKey(node: BuilderNode): boolean {
  if (node.kind === "component" && node.componentKey === TILE_COMPARE_KEY) return true;
  const kids =
    node.kind === "element"
      ? (node.children ?? [])
      : node.kind === "repeat"
        ? [...(node.children ?? []), ...(node.emptyChildren ?? [])]
        : [];
  return kids.some(placesKey);
}

/** The product-card master with the compare control beside the card. */
export function withTileCompareNode(tree: NodeTree): NodeTree {
  if (!tree?.root || placesKey(tree.root)) return tree;
  const compare: BuilderNode = {
    id: `${TILE_COMPARE_KEY}-node`,
    kind: "component",
    componentKey: TILE_COMPARE_KEY,
    props: { productId: { kind: "binding", path: "props.card.id" } },
  } as BuilderNode;
  const wrapper: BuilderNode = {
    id: `${TILE_COMPARE_KEY}-wrap`,
    kind: "element",
    tag: "div",
    children: [tree.root, compare],
  } as BuilderNode;
  return { ...tree, root: wrapper };
}

/** The component library with the tile compare placed on `product-card`, when there is one. */
export function withTileCompareInComponents<T extends Record<string, NodeTree | null | undefined>>(components: T): T {
  const card = components?.[PRODUCT_CARD_KEY];
  if (!card) return components;
  const next = withTileCompareNode(card);
  return next === card ? components : ({ ...components, [PRODUCT_CARD_KEY]: next } as T);
}
