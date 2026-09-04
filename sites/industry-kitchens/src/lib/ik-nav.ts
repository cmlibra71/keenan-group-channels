import { resolveNavItems, type MegaMenuNodeLike, type MegaNavItem } from "@/lib/mega-menu";

/**
 * The Industry Kitchens department list — ONE function, so the dark bar, the
 * phone drawer and the /products department strip cannot disagree.
 *
 * Composition itself is the shared, unit-tested `resolveNavItems` that Chefs
 * Depot and `template/` use (card mOTgYEvX): every department unless it is
 * switched off in Storefront > Navigation, in the editor's order, with the
 * editor's extras. The one thing IK adds on top is its permanent red
 * "All Categories" launcher.
 *
 * The launcher is not decoration. With JavaScript off, the departments that
 * overflow into the bar's "More" menu are unreachable from the bar, so
 * /categories is the only place left that lists every one — the same reason the
 * entry stays on Chefs Depot (card 9wau4Tx9). It is prepended only when the
 * editor has not already put an "all departments" entry on the bar, so nobody
 * ever gets two.
 *
 * It lives here rather than in either component because the phone drawer MUST
 * mirror the bar item for item (9wau4Tx9, Steve 2026-08-10: "it should be the
 * same as the desktop menu"). Prepending it in one component and not the other
 * is exactly how that rule was broken once already.
 */
export function ikNavItems(input: {
  departments: MegaMenuNodeLike[];
  items?: MegaNavItem[] | null;
  hiddenCategoryIds?: number[] | null;
}): MegaNavItem[] {
  const resolved = resolveNavItems(input);
  if (resolved.some((i) => i.type === "categories")) return resolved;
  return [{ type: "categories", label: "All Categories" }, ...resolved];
}
