import type { BuilderNode, NodeCondition, NodeTree, TextPart } from "@keenan/services/builder";

// ============================================================================
// The group-wide Item ID, directly ABOVE the SKU line (card 59ruI8uJ; Tim
// 2026-09-21 on NPb4NykW "Push to product page on front end of site. Place
// above the SKU", Steve 2026-09-24 "We want the Item ID above the SKU on each
// product listing on the front end").
//
// WHY CODE AND NOT AUTHORING. Both storefronts render the product page from an
// AUTHORED node tree stored in the database (`sf-product-page`): editing the
// seed or the React page ships nothing a customer sees. A line that has to be on
// every product page on both sites is therefore placed here, at render time —
// the `silverchef-node.ts` pattern. Nothing is written to the stored trees, so a
// rollback has nothing to undo.
//
// SAME STYLE AS THE SKU LINE, BY CONSTRUCTION. The two live trees write their
// SKU line differently — Industry Kitchens a `<p>` holding a "SKU: " span and a
// value span, Chefs Depot one `<p class="spec-mono">` inside a flex meta row
// beside the review stars — so rather than invent markup per site, the pass
// CLONES whatever SKU line the tree carries and swaps only the words: "SKU" →
// "Item ID", `product.sku` → `product.itemRef`. Tag, classes and structure come
// from the author, so the Item ID line can never look unlike the line under it,
// and no class is introduced that the deployed stylesheet might not carry.
//
// ABOVE, NOT BESIDE. Where the SKU line sits in a horizontal flex row (Chefs
// Depot's meta row) inserting the clone into that row would put the Item ID to
// the LEFT of the SKU on one line. The clone then goes in a copy of that row —
// same classes, so the same spacing — placed immediately before it.
//
// NO CODE, NO LINE. The clone is conditioned on `product.itemRef`, which is null
// when the product has no live, publishable Item: the line is absent, never a
// bare "Item ID:" label.
//
// NEVER INTO A REPEAT OR A COMPONENT. The related-products rail's tiles carry
// their own SKU line (`card.sku`, inside a `repeat`), and listing tiles are NOT
// part of this card. The walk follows ELEMENT children only — the repeat rule
// `silverchef-node.ts` learned the hard way — so a tile can never gain an Item ID
// and a tile's SKU line can never be mistaken for the page's.
//
// IDEMPOTENT. A tree that already binds `product.itemRef` anywhere (an author
// placed an Item ID line in the Site Builder) is returned untouched, and the
// same object comes back, so the common path allocates nothing. A tree with no
// SKU line at all is also returned untouched: there is nothing to sit above.
//
// PURE. Never mutates the stored tree — the branch caches it.
// ============================================================================

/** The id of the placed Item ID line. Descendants of a cloned line get their
 *  source id plus {@link ID_SUFFIX}, so every id on the page stays unique. */
export const ITEM_ID_NODE_ID = "item-id-line";
/** The id of the row copy used when the SKU line sits in a horizontal flex row. */
export const ITEM_ID_ROW_ID = "item-id-row";
const ID_SUFFIX = "--item-id";

const SKU_PATH = "product.sku";
export const ITEM_ID_PATH = "product.itemRef";
const SKU_WORD = /\bSKU\b/g;
const ITEM_ID_WORD = "Item ID";

const showWhenItemId = (): NodeCondition => ({ kind: "data", path: ITEM_ID_PATH });

/** Element children only — see the repeat rule above. */
function openChildrenOf(node: BuilderNode): BuilderNode[] {
  return node.kind === "element" ? (node.children ?? []) : [];
}

/** Every child, repeats included — used only to ask "is an Item ID already bound somewhere". */
function anyChildOf(node: BuilderNode): BuilderNode[] {
  if (node.kind === "element") return node.children ?? [];
  if (node.kind === "repeat") return [...(node.children ?? []), ...(node.emptyChildren ?? [])];
  return [];
}

function bindsItemId(node: BuilderNode): boolean {
  if (node.id === ITEM_ID_NODE_ID || node.id === ITEM_ID_ROW_ID) return true;
  if (node.kind === "element" && (node.text ?? []).some((t) => t.kind === "binding" && t.path === ITEM_ID_PATH)) {
    return true;
  }
  return anyChildOf(node).some(bindsItemId);
}

/** What this element's own text, and its element descendants' text, says. */
function textFacts(node: BuilderNode): { skuWord: boolean; skuBinding: boolean } {
  if (node.kind !== "element") return { skuWord: false, skuBinding: false };
  let skuWord = false;
  let skuBinding = false;
  for (const part of node.text ?? []) {
    if (part.kind === "static" && new RegExp(SKU_WORD.source).test(part.value)) skuWord = true;
    if (part.kind === "binding" && part.path === SKU_PATH) skuBinding = true;
  }
  for (const child of openChildrenOf(node)) {
    const f = textFacts(child);
    skuWord ||= f.skuWord;
    skuBinding ||= f.skuBinding;
  }
  return { skuWord, skuBinding };
}

/** A path of element nodes from the root down to the SKU line (last entry). */
type Path = BuilderNode[];

/**
 * The SMALLEST element that both says "SKU" and binds `product.sku` — the page's
 * SKU line. Depth-first, elements only; children are tried before the node
 * itself so a wrapper that merely CONTAINS the SKU line is never picked.
 * Chefs Depot's Lainox paragraph binds `product.sku` too ("refer to spec sheet
 * {sku}") but never says "SKU", so it is not a SKU line.
 */
function findSkuLine(node: BuilderNode, trail: Path = []): Path | null {
  if (node.kind !== "element") return null;
  const here = [...trail, node];
  for (const child of openChildrenOf(node)) {
    const found = findSkuLine(child, here);
    if (found) return found;
  }
  const facts = textFacts(node);
  return facts.skuWord && facts.skuBinding ? here : null;
}

const swapText = (part: TextPart): TextPart => {
  if (part.kind === "static") return { ...part, value: part.value.replace(SKU_WORD, ITEM_ID_WORD) };
  if (part.kind === "binding" && part.path === SKU_PATH) return { ...part, path: ITEM_ID_PATH };
  if (part.kind === "expr") return { ...part, source: part.source.split(SKU_PATH).join(ITEM_ID_PATH) };
  return part;
};

const swapCondition = (condition: NodeCondition | undefined): NodeCondition | undefined => {
  if (!condition) return undefined;
  if (condition.kind === "data" && condition.path === SKU_PATH) return { ...condition, path: ITEM_ID_PATH };
  if (condition.kind === "expr") return { ...condition, source: condition.source.split(SKU_PATH).join(ITEM_ID_PATH) };
  return condition;
};

/** A faithful copy of the SKU line reading the Item ID instead. Events and local
 *  state are dropped: a line of text has no business firing a second copy of
 *  anything the original does. */
function cloneAsItemId(node: BuilderNode, isRoot: boolean): BuilderNode {
  if (node.kind !== "element") return { ...node, id: `${node.id}${ID_SUFFIX}` };
  const { events: _events, state: _state, ...rest } = node;
  const clone: BuilderNode = {
    ...rest,
    id: isRoot ? ITEM_ID_NODE_ID : `${node.id}${ID_SUFFIX}`,
    label: isRoot ? "item-id" : node.label,
    condition: isRoot ? showWhenItemId() : swapCondition(node.condition),
  };
  if (node.text) clone.text = node.text.map(swapText);
  if (node.children) clone.children = node.children.map((child) => cloneAsItemId(child, false));
  return clone;
}

/** A horizontal flex row lays its children side by side; the Item ID must sit ABOVE. */
function isHorizontalRow(node: BuilderNode): boolean {
  if (node.kind !== "element") return false;
  const classes = node.classes ?? [];
  const flex = classes.includes("flex") || classes.includes("inline-flex");
  return flex && !classes.includes("flex-col");
}

/** Rebuild the path bottom-up with `replace(parent)` applied at `depth`. */
function rebuild(path: Path, depth: number, replaced: BuilderNode): BuilderNode {
  let current = replaced;
  for (let i = depth - 1; i >= 0; i--) {
    const parent = path[i];
    if (parent.kind !== "element") return path[0];
    const target = path[i + 1];
    current = { ...parent, children: openChildrenOf(parent).map((c) => (c === target ? current : c)) };
  }
  return current;
}

/** `parent` with `inserted` placed immediately before `before`. */
function insertBefore(parent: BuilderNode, before: BuilderNode, inserted: BuilderNode): BuilderNode {
  if (parent.kind !== "element") return parent;
  const kids = openChildrenOf(parent);
  const index = kids.indexOf(before);
  const next = [...kids];
  next.splice(index < 0 ? 0 : index, 0, inserted);
  return { ...parent, children: next };
}

/**
 * The product tree with an Item ID line directly above its SKU line.
 *
 * Returns the SAME tree object when an Item ID is already bound (an author
 * placed one) or when the tree has no SKU line to sit above.
 */
export function withItemIdNode(tree: NodeTree): NodeTree {
  if (bindsItemId(tree.root)) return tree;
  const path = findSkuLine(tree.root);
  if (!path || path.length < 2) return tree;

  const skuLine = path[path.length - 1];
  const parent = path[path.length - 2];
  const line = cloneAsItemId(skuLine, true);

  // Side-by-side row with a parent of its own: copy the row, put the line in it,
  // and place the copy immediately before the original row.
  if (isHorizontalRow(parent) && path.length >= 3 && parent.kind === "element") {
    const grandparent = path[path.length - 3];
    const { events: _events, state: _state, ...rowShape } = parent;
    const row: BuilderNode = {
      ...rowShape,
      id: ITEM_ID_ROW_ID,
      label: "item-id-row",
      condition: showWhenItemId(),
      children: [line],
    };
    return { ...tree, root: rebuild(path, path.length - 3, insertBefore(grandparent, parent, row)) };
  }

  return { ...tree, root: rebuild(path, path.length - 2, insertBefore(parent, skuLine, line)) };
}
