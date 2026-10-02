// ============================================================================
// THE WISHLIST'S WORDS ARE CMS DATA (Industry Kitchens, 2026-10-02).
//
// Every word the wishlist prints — the product page button, the tile link, the account page's
// headings, buttons, messages and empty state — is a STATIC TEXT PROP on the node that places it,
// inside the channel's component masters (`wishlist-add`, `wishlist-tile`, `account-wishlist`),
// edited in the portal's Site Builder like any other copy. Nothing here supplies a default: a word
// the master does not carry is simply not printed, and a control whose label is missing is not
// drawn (a button with no words is worse than no button).
//
// Pure: no React, no DB — unit-tested.
// ============================================================================

/** A node prop as a printable word: a non-empty string after trimming, else null. */
export function wishlistWord(props: Record<string, unknown> | null | undefined, key: string): string | null {
  const v = props?.[key];
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

/**
 * Fill `{name}`-style placeholders ("{product} has been added to your wishlist.").
 * An unknown placeholder is left as written, so an author's typo shows up on the page rather than
 * vanishing; values are inserted as text (React escapes them), never as markup.
 */
export function fillWishlistWord(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{([a-z_]+)\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : whole
  );
}

/**
 * The account-menu label: the static `label_nav` prop on the `wishlist-items` native inside the
 * channel's `account-wishlist` master. Null when the master or the prop is missing — then the menu
 * shows no wishlist item (a nameless link is worse than none).
 */
export function accountWishlistNavLabel(master: unknown, nativeKey = "wishlist-items"): string | null {
  const stack: unknown[] = [(master as { root?: unknown } | null)?.root];
  while (stack.length) {
    const n = stack.pop() as Record<string, unknown> | null | undefined;
    if (!n || typeof n !== "object") continue;
    if (n.kind === "component" && n.componentKey === nativeKey) {
      const v = (n.props as Record<string, { kind?: string; value?: unknown }> | undefined)?.label_nav;
      return v?.kind === "static" && typeof v.value === "string" && v.value.trim() ? v.value.trim() : null;
    }
    for (const c of (n.children as unknown[] | undefined) ?? []) stack.push(c);
  }
  return null;
}

/** The words the account page's list reads, by prop name — documented for authors and tests. */
export const ACCOUNT_WISHLIST_WORD_KEYS = [
  "label_empty",
  "label_added",
  "label_product",
  "label_comment",
  "label_comment_placeholder",
  "label_quantity",
  "label_add_to_cart",
  "label_add_to_quote",
  "label_added_to_cart",
  "label_added_to_quote",
  "label_remove",
  "label_update",
  "label_updated",
  "label_continue",
  "label_error",
  "label_nav",
] as const;
