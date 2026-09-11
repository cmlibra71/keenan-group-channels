import type { NodeTree, BuilderNode } from "@keenan/services/builder";

// ============================================================================
// Price WORDING on the authored trees while the Chefs Depot member price scale
// is switched on (card gk23c1VK — Tim's locked 11 Sep 2026 model).
//
// Under the scale, the headline a logged-out visitor sees is M, the Industry
// Kitchens Mates Rate — "our standard price", the one anyone can pay. It is NOT
// the recommended retail price. But the stored Site Builder masters that draw
// the price (`price-panel` on the product page, `price-block` on the listing
// tile, on the published trees of both storefronts) carry a STATIC "RRP" label
// beside that headline and beside the struck-through comparison, and a member's
// saving line printed as "You save $X (Y%)" / "Member saves $X (Y%)".
//
// Both are wrong on a screen the scale prices, and both are rules Tim's pack
// makes in terms: "'Off retail' — the reference is Mates Rate, not RRP" is on
// the may-NOT-say list, and "no percentage saving may be published until the
// spread distribution is measured". A per-SKU DOLLAR figure computed from that
// product's own prices is allowed, so the dollars stay and only the percentage
// goes.
//
// WHY A RENDER-TIME TRANSFORM. The labels live in STORED trees, so editing a
// seed or a component ships nothing, and rewriting the stored masters would
// change the page while the scale is still OFF — where "RRP" is true (a Chefs
// Depot guest pays the catalogue price). Copy and engine turn on together: the
// "RRP" relabel runs only where the channel's scale is on, is applied once at
// the `getComponents` seam in each site's `lib/store.ts` (the read every
// authored route goes through), and writes nothing back. The same seam and the
// same shape as the promo tag and the brand-logo fallback.
//
// THE PERCENTAGE IS DIFFERENT: IT GOES IN BOTH STATES WHERE THE CHANNEL SAYS SO.
// The card's rule is "no saving percentage renders anywhere while the spread is
// unmeasured" — no on/off carve-out — so a channel whose store sets
// `HIDE_MEMBER_SAVING_PCT` (Chefs Depot) has its member-saving percentages cut
// with the scale off too; only the "RRP" wording waits for the switch. Industry
// Kitchens and the template leave the flag false and are untouched.
//
// PURE + IDEMPOTENT. Returns the SAME map when there is nothing to do (scale off
// and no percentage to hide), so that path allocates nothing.
// ============================================================================

/** What the headline and the comparison are called while the scale is on. */
export const STANDARD_PRICE_LABEL = "Standard price";

/**
 * Bindings that print a MEMBER saving as a percentage. `save_pct` (the listing
 * tile's "Save X%" sale badge) is deliberately NOT here: that badge is a
 * clearance/sale saving measured per product, which Steve kept (CXnP1lrL), not a
 * claim about member pricing.
 */
const MEMBER_PCT_BINDING = /(^|\.)(savePct|member_save_pct|teaser_save_pct|memberSavingsPct)$/;

type TextPart = NonNullable<Extract<BuilderNode, { kind: "element" }>["text"]>[number];

function relabel(parts: TextPart[], relabelRrp: boolean): TextPart[] | null {
  let changed = false;
  let next: TextPart[] = parts.map((p) => {
    if (relabelRrp && p.kind === "static" && /^\s*RRP\s*$/.test(p.value)) {
      changed = true;
      return { ...p, value: p.value.replace("RRP", STANDARD_PRICE_LABEL) };
    }
    return p;
  });

  // "… ({pct}%)" → "…": drop the parenthesised percentage, keep the dollars.
  for (let i = 0; i < next.length; i++) {
    const part = next[i];
    if (part.kind !== "binding" || !MEMBER_PCT_BINDING.test(part.path)) continue;
    const before = next[i - 1];
    const after = next[i + 1];
    if (before?.kind === "static" && /\(\s*$/.test(before.value) && after?.kind === "static" && /^\s*%\s*\)/.test(after.value)) {
      const head = { ...before, value: before.value.replace(/\s*\(\s*$/, "") };
      const tail = { ...after, value: after.value.replace(/^\s*%\s*\)/, "") };
      next = [...next.slice(0, i - 1), head, ...(tail.value ? [tail] : []), ...next.slice(i + 2)];
      changed = true;
      i -= 1;
    }
  }
  return changed ? next : null;
}

/** True when a text run still prints a member-saving percentage after relabelling. */
function stillPrintsPct(parts: TextPart[] | undefined): boolean {
  return !!parts?.some((p) => p.kind === "binding" && MEMBER_PCT_BINDING.test(p.path));
}

function walk(node: BuilderNode, relabelRrp: boolean): BuilderNode {
  let out: BuilderNode = node;
  if (node.kind === "element") {
    const text = node.text ? relabel(node.text, relabelRrp) : null;
    const kids = node.children ?? [];
    const nextKids = kids.map((k) => walk(k, relabelRrp));
    const kidsChanged = nextKids.some((k, i) => k !== kids[i]);
    const finalText = text ?? node.text;
    // A percentage we could not cut out cleanly ("Members save up to {pct}%")
    // is a claim with nothing left to say once the number goes: the node is
    // hidden rather than left printing half a sentence.
    const hide = stillPrintsPct(finalText);
    if (text || kidsChanged || hide) {
      out = {
        ...node,
        ...(text ? { text } : {}),
        ...(kidsChanged ? { children: nextKids } : {}),
        ...(hide ? { condition: { kind: "expr", source: "false" } } : {}),
      } as BuilderNode;
    }
  } else if (node.kind === "repeat") {
    const kids = node.children ?? [];
    const nextKids = kids.map((k) => walk(k, relabelRrp));
    const empty = node.emptyChildren ?? [];
    const nextEmpty = empty.map((k) => walk(k, relabelRrp));
    if (nextKids.some((k, i) => k !== kids[i]) || nextEmpty.some((k, i) => k !== empty[i])) {
      out = { ...node, children: nextKids, emptyChildren: nextEmpty } as BuilderNode;
    }
  }
  return out;
}

export interface MemberScaleLabelOptions {
  /**
   * Read a static "RRP" as "Standard price". True only while the channel's
   * member price scale is ON (where "RRP" beside a Mates Rate would be false).
   * Defaults to true for a single tree: callers pass it explicitly.
   */
  relabelRrp?: boolean;
}

/**
 * One tree: member-saving percentages cut (always), "RRP" relabelled when
 * `relabelRrp` — the SAME object when nothing in it needed either.
 */
export function withMemberScaleLabelsInTree<T extends NodeTree>(tree: T, opts: MemberScaleLabelOptions = {}): T {
  if (!tree?.root) return tree;
  const root = walk(tree.root, opts.relabelRrp !== false);
  return root === tree.root ? tree : ({ ...tree, root } as T);
}

/**
 * Every component master: relabelled when the channel's scale is ON; with it
 * off, member percentages still cut where `hideMemberPct` (the channel's
 * `HIDE_MEMBER_SAVING_PCT`); the SAME map, untouched, when neither applies.
 */
export function withMemberScaleLabels<M extends Record<string, NodeTree>>(
  components: M,
  scaleOn: boolean,
  { hideMemberPct = false }: { hideMemberPct?: boolean } = {}
): M {
  if ((!scaleOn && !hideMemberPct) || !components) return components;
  let changed = false;
  const out: Record<string, NodeTree> = {};
  for (const [key, tree] of Object.entries(components)) {
    const next = withMemberScaleLabelsInTree(tree, { relabelRrp: scaleOn });
    if (next !== tree) changed = true;
    out[key] = next;
  }
  return changed ? (out as M) : components;
}
