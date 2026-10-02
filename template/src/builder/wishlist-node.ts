import type { NodeTree, BuilderNode } from "@keenan/services/builder";
import { templateOwns } from "@keenan/services/builder";

// ============================================================================
// Placing the WISHLIST on the live pages (Industry Kitchens, 2026-10-02).
//
// WHAT IS PLACED IS A REFERENCE TO A CMS MASTER, NOT A CONTROL. The product page gets the
// channel's `wishlist-add` master and every `product-card` tile gets its `wishlist-tile` master.
// Those masters live in the channel's component library and hold the sealed natives
// (`product-wishlist`, `tile-wishlist`) together with EVERY WORD they print (static text props)
// and their Show-if — so the wording, the conditions and even the layout are edited in the
// portal's Site Builder, and this file holds none of them. A channel with no such master renders
// nothing for the reference (services NodeRenderer: an unknown key with no master is null).
//
// WHO. ENGINE (shared, byte-identical in every tree) but switched by the channel setting
// `wishlist_enabled` (channel_settings, absent = OFF). The caller passes the switch in; off returns
// the very same object, so a channel without the feature — Chefs Depot — is untouched by reference.
//
// AUTHOR FIRST. A tree (or any master it places) that already places the master or the native —
// or a stored template that declares `wishlist` in `data-kg-template-owns` — keeps exactly what it
// authored and nothing is added.
//
// PURE. Never mutates the stored tree or master (both are cached and shared with the editor).
// ============================================================================

/** The product-page master and its native. */
export const WISHLIST_ADD_MASTER = "wishlist-add";
export const WISHLIST_BUTTON_NATIVE = "product-wishlist";
/** The tile master and its native. */
export const WISHLIST_TILE_MASTER = "wishlist-tile";
export const WISHLIST_TILE_NATIVE = "tile-wishlist";
/** The account page master and its native. */
export const ACCOUNT_WISHLIST_MASTER = "account-wishlist";
export const ACCOUNT_WISHLIST_NATIVE = "wishlist-items";
/** The `data-kg-template-owns` name. */
export const WISHLIST_PLACEMENT = "wishlist";
/** The setting that switches the whole feature on for a channel. */
export const WISHLIST_FLAG = "wishlist_enabled";

const PRODUCT_CARD_KEY = "product-card";
const COMPARE_KEYS = new Set(["product-compare"]);
const TILE_COMPARE_WRAP_ID = "tile-compare-wrap";

type Library = Record<string, NodeTree | null | undefined>;

function kidsOf(node: BuilderNode): BuilderNode[] {
  if (node.kind === "element") return node.children ?? [];
  if (node.kind === "repeat") return [...(node.children ?? []), ...(node.emptyChildren ?? [])];
  return [];
}

/** Does `node` place any of `keys` — itself, below it, or inside a master it references? */
function places(node: BuilderNode, keys: ReadonlySet<string>, library: Library, seen: Set<string>): boolean {
  if (node.kind === "component") {
    if (keys.has(node.componentKey)) return true;
    const key = node.componentKey;
    if (key && !seen.has(key)) {
      seen.add(key);
      const master = library[key];
      if (master?.root && places(master.root, keys, library, seen)) return true;
    }
  }
  return kidsOf(node).some((c) => places(c, keys, library, seen));
}

function openKids(node: BuilderNode): BuilderNode[] {
  return node.kind === "element" ? (node.children ?? []) : [];
}

/** The first child (depth-first, never into a repeat) matching `match`, with its parent. */
function find(node: BuilderNode, match: (n: BuilderNode) => boolean): { parent: BuilderNode; child: BuilderNode } | null {
  for (const child of openKids(node)) if (match(child)) return { parent: node, child };
  for (const child of openKids(node)) {
    const hit = find(child, match);
    if (hit) return hit;
  }
  return null;
}

function insertAfter(node: BuilderNode, parent: BuilderNode, child: BuilderNode, add: BuilderNode): BuilderNode {
  if (node.kind !== "element") return node;
  const kids = node.children ?? [];
  if (node === parent) {
    const next = [...kids];
    const index = kids.indexOf(child);
    next.splice(index < 0 ? next.length : index + 1, 0, add);
    return { ...node, children: next };
  }
  return { ...node, children: kids.map((k) => insertAfter(k, parent, child, add)) };
}

const isCompare = (n: BuilderNode) => n.kind === "component" && COMPARE_KEYS.has(n.componentKey);
const isActionsRow = (n: BuilderNode) => n.kind === "component" && n.componentKey === "actions-row";

export interface WishlistNodeOptions {
  /** The channel's `wishlist_enabled`. False returns the tree untouched. */
  enabled: boolean;
  /** The component library the page renders with (an author may have placed it in a master). */
  components?: Library | null;
}

/**
 * The product tree with the `wishlist-add` master directly after the compare control (or, with no
 * compare control, after the buy row; with neither, at the end of the root). Returns the SAME
 * object when the feature is off or the wishlist is already placed.
 */
export function withWishlistNode(tree: NodeTree, opts: WishlistNodeOptions): NodeTree {
  if (!opts.enabled || !tree?.root) return tree;
  if (templateOwns(tree, WISHLIST_PLACEMENT)) return tree;
  const keys = new Set([WISHLIST_ADD_MASTER, WISHLIST_BUTTON_NATIVE]);
  if (places(tree.root, keys, opts.components ?? {}, new Set())) return tree;

  const ref: BuilderNode = { id: WISHLIST_ADD_MASTER, kind: "component", componentKey: WISHLIST_ADD_MASTER };
  const hit = find(tree.root, isCompare) ?? find(tree.root, isActionsRow);
  if (hit) return { ...tree, root: insertAfter(tree.root, hit.parent, hit.child, ref) };
  if (tree.root.kind === "element") return { ...tree, root: { ...tree.root, children: [...openKids(tree.root), ref] } };
  return tree;
}

/**
 * The `product-card` master with the `wishlist-tile` master placed under the tile's own controls,
 * the row handed in as `props.card`. Never inside the tile's link (no control nests in an <a>).
 *
 * WHERE, in order:
 *   1. INSIDE the card's own box — the root, or the card the compare pass wrapped (its first
 *      element child) — as its last child, when that box is not a link. On Industry Kitchens the
 *      card is a full-height flex column (`h-full`), so a control placed AFTER it would hang below
 *      the grid cell and sit under the next row's tile; placed inside, it takes its space in the
 *      card and the row grows to fit (old site: the add-to links sit under the tile's buttons).
 *   2. Otherwise beside the card: the compare wrapper, else a new plain <div> around the card.
 */
export function withWishlistTileNode(card: NodeTree, library: Library = {}): NodeTree {
  if (!card?.root) return card;
  if (templateOwns(card, WISHLIST_PLACEMENT)) return card;
  if (places(card.root, new Set([WISHLIST_TILE_MASTER, WISHLIST_TILE_NATIVE]), library, new Set([PRODUCT_CARD_KEY]))) {
    return card;
  }
  const ref = {
    id: `${WISHLIST_TILE_MASTER}-node`,
    kind: "component",
    componentKey: WISHLIST_TILE_MASTER,
    props: { card: { kind: "binding", path: "props.card" } },
  } as BuilderNode;
  const root = card.root;
  const isBox = (n: BuilderNode | undefined): n is Extract<BuilderNode, { kind: "element" }> =>
    !!n && n.kind === "element" && (n as { tag?: string }).tag !== "a";
  const append = (n: Extract<BuilderNode, { kind: "element" }>): BuilderNode => ({ ...n, children: [...(n.children ?? []), ref] });

  if (root.kind === "element" && root.id === TILE_COMPARE_WRAP_ID) {
    const kids = root.children ?? [];
    const index = kids.findIndex((k) => k.kind === "element");
    const inner = index >= 0 ? kids[index] : undefined;
    if (isBox(inner)) {
      const next = [...kids];
      next[index] = append(inner);
      return { ...card, root: { ...root, children: next } };
    }
    return { ...card, root: append(root) };
  }
  if (isBox(root)) return { ...card, root: append(root) };
  const wrapper = { id: `${WISHLIST_TILE_MASTER}-wrap`, kind: "element", tag: "div", children: [root, ref] } as BuilderNode;
  return { ...card, root: wrapper };
}

/** The library with the tile wishlist placed on `product-card` — the same map when off or absent. */
export function withWishlistTileInComponents<T extends Library>(components: T, enabled: boolean): T {
  if (!enabled) return components;
  const card = components?.[PRODUCT_CARD_KEY];
  if (!card) return components;
  const next = withWishlistTileNode(card, components);
  return next === card ? components : ({ ...components, [PRODUCT_CARD_KEY]: next } as T);
}

/** The account page's tree: one reference to the channel's `account-wishlist` master. */
export const ACCOUNT_WISHLIST_TREE: NodeTree = {
  v: 1,
  root: { id: ACCOUNT_WISHLIST_MASTER, kind: "component", componentKey: ACCOUNT_WISHLIST_MASTER },
} as NodeTree;
