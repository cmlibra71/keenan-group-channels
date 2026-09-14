/**
 * WHO A BLOG POST IS SIGNED BY when the post itself names nobody.
 *
 * This file is the SHARED template: whatever it returns is printed on Chefs
 * Depot and on Industry Kitchens alike. It used to be the literal string
 * "Industry Kitchens", so a Chefs Depot reader was told an Industry Kitchens
 * masthead wrote the article — the two are separate businesses and their names
 * never cross (PRODUCT-BRIEF §1; card nHVhkIR4, Chris 2026-09-14: "anything
 * customer-facing needs to be branded to the correct site").
 *
 * The order: this storefront's own display name from its `sites` row, then the
 * channel's name, then NOTHING. A missing byline is a small absence; the other
 * business's name is a false statement, so the fallback stops rather than
 * guessing.
 */
export function blogByline(
  postAuthorName: string | null | undefined,
  siteName: string | null | undefined,
  channelName: string | null | undefined
): string | null {
  return (
    (postAuthorName || "").trim() ||
    (siteName || "").trim() ||
    (channelName || "").trim() ||
    null
  );
}
