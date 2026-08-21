// ============================================================================
// Where a reader lands after a link is followed (card N6U9USKo).
//
// Next's App Router does not put the reader at the top of the new page: it
// scrolls the CHANGED SEGMENT into view, and skips even that when the segment's
// top edge already happens to be inside the viewport. Following a footer Quick
// Link from the bottom of a long page therefore lands at the bottom, the middle
// or nowhere at all, which is exactly what was reported: "Lands at bottom or
// middle or random - Or doesn't move at all" (measured on Industry Kitchens:
// home page footer -> /pages/warranty left the reader at scrollY 3842 of 3842,
// i.e. staring at the warranty page's own footer).
//
// So the storefront resets the scroll itself on a real page-to-page navigation
// — and ONLY on one. This module is the pure decision; ScrollReset.tsx is the
// three lines of browser that act on it.
// ============================================================================

export type ScrollResetInput = {
  /** The path we were on, or null on the first paint of a fresh page load. */
  previousPath: string | null;
  /** The path we are on now. */
  nextPath: string;
  /** Path recorded by the most recent popstate (back/forward), else null. */
  poppedPath: string | null;
  /** `window.location.hash`, including the "#", or "" when there is none. */
  hash: string;
};

/**
 * True when the storefront should put the reader at the top of the page.
 *
 * Everything this returns FALSE for is a position somebody else owns, and each
 * one is a bug if we take it over:
 *
 *  - **First paint.** The browser owns it: it restores the scroll position on a
 *    reload and honours a `#fragment` typed straight into the address bar.
 *  - **Same path.** Paging and filtering a listing change only the query string
 *    and deliberately keep the reader where they are (`scroll={false}` on the
 *    category and search "next page" links). Yanking them back to the top of the
 *    grid every time they ask for more products is the opposite of the fix.
 *  - **Back / forward.** Returning to a long category listing must return to the
 *    row the reader left, not to the top of it.
 *  - **A link with a #fragment.** The anchor names the position. In-page anchors
 *    on this storefront are `<a name="…">` rather than ids — the content
 *    sanitiser's allow-list keeps `name` and drops `id` (card JJt81JQv) — and
 *    Next resolves both, so the anchor is left to do its job.
 */
export function shouldResetScroll({
  previousPath,
  nextPath,
  poppedPath,
  hash,
}: ScrollResetInput): boolean {
  if (previousPath === null) return false;
  if (previousPath === nextPath) return false;
  if (poppedPath === nextPath) return false;
  if (hash) return false;
  return true;
}
