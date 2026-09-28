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
// Depot's masters are never touched. The native is registered in the category,
// brand and product natives, so a `product-card` placed on the home rails
// (where the old site showed no compare link) renders the card and nothing
// more: an unregistered key with no master renders null.
//
// AUTHOR FIRST / IDEMPOTENT. A master that already places `tile-compare` is
// returned as it is. PURE: the stored master is never mutated.
//
// PER PAGE (IK parity, product cards — 2026-09-28 old-site harvest). Zoey's product list is
// configured per page, and MOST category lists hide the compare link (`hide-compare`); a few
// show it (Chefs Hat, Lightfry). The page's switch reaches the tree as `context.listing.compare`
// (services `listing-settings.ts`, from the category / brand `metafields.zoey_listing`), so the
// placed node carries `context.listing.compare !== false`: a page with no stored setting keeps
// the link, a page Zoey hid it on loses it.
//
// The product page registers the native too: Zoey's related rail carries the link on most
// product layouts (2 of 3 sampled). The home rails do not (old home page, 2026-09-28): the home
// natives do not register it AND the condition excludes the home page, so a draft preview (which
// marks an unregistered key "[missing component]") draws nothing there either.
// ============================================================================

/** The condition the placed compare node carries: hidden only where the page's list hides it. */
export const TILE_COMPARE_CONDITION = 'context.kind != "home" && context.listing.compare !== false';

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
    condition: { kind: "expr", source: TILE_COMPARE_CONDITION },
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
