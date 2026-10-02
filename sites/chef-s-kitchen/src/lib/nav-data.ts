import { cache } from "react";
import { createHash } from "node:crypto";
import { getMegaMenu, getHeaderNav, getMegaMenuHidden } from "@/lib/store";
import { getMegaMenuBrandColumns } from "@/lib/mega-menu-brands";
import { slimDepartments, slimNavItems, type NavData } from "@/lib/nav-model";

/** Where the browser fetches the drop-downs' data (app/api/nav/route.ts). */
export const NAV_DATA_PATH = "/api/nav";

/**
 * The header menu's data (see nav-model.ts) and its content version.
 *
 * Every read is the same cached read the header has always made, and each
 * degrades the way it always did: the Header renders in the root layout, ABOVE
 * the page's error boundary, so a transient DB failure must cost the menu, never
 * the storefront. The version is a hash of the data itself, so the browser can
 * cache /api/nav?v=<version> forever: any change to the menu is a new URL.
 */
export const loadNavData = cache(async (): Promise<{ data: NavData; version: string }> => {
  const [megaMenu, items, hiddenCategoryIds] = await Promise.all([
    getMegaMenu().catch(() => ({ departments: [], featured: {} })),
    getHeaderNav().catch(() => []),
    getMegaMenuHidden().catch(() => []),
  ]);
  // The drop-downs' Brands columns (card HaWBvySC). Free unless somebody has
  // added one in Storefront > Navigation; a failure drops the brands, never the
  // header.
  const brandColumns = await getMegaMenuBrandColumns(items, megaMenu.departments).catch(() => ({}));
  const data: NavData = {
    departments: slimDepartments(megaMenu.departments, items),
    featured: megaMenu.featured ?? {},
    items: slimNavItems(items),
    hiddenCategoryIds,
    brandColumns,
  };
  const version = createHash("sha1").update(JSON.stringify(data)).digest("base64url").slice(0, 16);
  return { data, version };
});
