import Link from "next/link";
import { Menu, ChevronDown, Star } from "lucide-react";
import { itemHref, panelBrandColumn, panelExtras, shortNavLabel, type MegaMenuNodeLike, type MegaNavItem } from "@/lib/mega-menu";
import { navItemKey, navModel, type NavData } from "@/lib/nav-model";
import { LazyDeptPanel, LazyLinkDropdown } from "./MegaMenuPanels";
import { MegaMenuShell } from "./MegaMenuShell";

/**
 * Design-system nav bar (Green-700) with CSS-driven mega panels.
 *
 * The bar POPULATES ITSELF: every top-level category is on it unless it has
 * been switched off (`hiddenCategoryIds`), and each department's panel fills
 * from the category tree. The Navigation editor's items (`nav_structure.header`)
 * set the order and add the extras — the gold "All Departments" entry, the
 * Clearance slot, custom links, and the information pages tucked inside a
 * department's drop-down (an item's children). Composition lives in
 * `@/lib/mega-menu` (shared with template/ and unit-tested); this file is
 * presentation only.
 *
 * Server component for the BAR — every bar link is in the page's HTML. The
 * drop-downs' CONTENTS are drawn in the browser from the menu data
 * (MegaMenuPanels.tsx, lib/nav-model.ts) instead of being rendered into every
 * page. Panels still open on pure-CSS hover and :focus-within. Hidden below lg
 * (the MobileNavDrawer takes over, from the same resolved items).
 */
export function MegaMenu({ data }: { data: NavData }) {
  const { left, right, byId } = navModel(data);

  return (
    <MegaMenuShell className="hidden lg:block bg-brand-deep relative">
      <div className="container-page">
        <ul data-nav-bar className="flex flex-nowrap items-stretch gap-0.5 overflow-hidden">
          {left.map((item, i) => renderItem(item, i, byId))}

          {/* Overflow — shown by MegaMenuShell only when the bar runs out of row */}
          <li
            data-nav-more
            style={{ display: "none" }}
            className="group/nav relative shrink-0"
          >
            <button
              type="button"
              className="flex h-full items-center gap-1.5 whitespace-nowrap px-4 py-[13px] text-[13.5px] font-semibold text-[#EAF2EC] transition-colors duration-200 group-hover/nav:bg-black/20 group-hover/nav:text-white group-focus-within/nav:bg-black/20"
              aria-haspopup="true"
            >
              More
              <ChevronDown className="h-[11px] w-[11px] opacity-70" strokeWidth={2} />
            </button>
            <div className="mega-panel invisible absolute h-0 overflow-hidden right-0 top-full z-[110] min-w-[220px] rounded-b-card border border-black/5 bg-white py-2 opacity-0 shadow-hover transition-all delay-0 duration-150 group-hover/nav:visible group-hover/nav:h-auto group-hover/nav:overflow-visible group-hover/nav:opacity-100 group-hover/nav:delay-[150ms] group-focus-within/nav:visible group-focus-within/nav:h-auto group-focus-within/nav:overflow-visible group-focus-within/nav:opacity-100">
              {left.map((item, i) => (
                <Link
                  key={`m-${i}`}
                  data-more-index={i}
                  style={{ display: "none" }}
                  href={itemHref(item, byId)}
                  target={item.newTab ? "_blank" : undefined}
                  className="block px-4 py-2 text-[13.5px] text-text-primary transition-colors hover:bg-brand-tint hover:text-brand-deep"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </li>

          <li className="flex-1" aria-hidden />

          {right.map((item, i) => (
            <li key={`r-${i}`} data-nav-right className="shrink-0">
              <Link
                href={itemHref(item, byId)}
                target={item.newTab ? "_blank" : undefined}
                className="flex h-full items-center gap-1.5 whitespace-nowrap px-3 py-[13px] text-[13px] font-bold text-member-bright transition-colors duration-200 hover:text-member"
              >
                {itemHref(item, byId) === "/clearance" && (
                  <Star className="h-3.5 w-3.5 fill-current" />
                )}
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </MegaMenuShell>
  );
}

function renderItem(
  item: MegaNavItem,
  i: number,
  byId: Map<number, MegaMenuNodeLike>
) {
  if (item.type === "categories") {
    return (
      <li key={`l-${i}`} data-nav-item className="shrink-0">
        <Link
          href="/categories"
          className="flex h-full items-center gap-2 whitespace-nowrap bg-member px-4 py-[13px] text-[13.5px] font-bold text-ink-900 transition-colors duration-200 hover:bg-member-bright"
        >
          <Menu className="h-4 w-4" strokeWidth={2.2} />
          {item.label || "All Departments"}
        </Link>
      </li>
    );
  }

  if (item.type === "category" && item.categoryId) {
    const dept = byId.get(item.categoryId);
    if (!dept) return null; // hidden/deleted category — drop the item
    const extras = panelExtras(item);
    const brandColumn = panelBrandColumn(item);
    const hasPanel = dept.children.length > 0 || extras.length > 0 || !!brandColumn;
    return (
      <li key={`l-${i}`} data-nav-item className="group/nav shrink-0">
        <Link
          href={`/categories/${dept.slug}`}
          className="flex h-full items-center gap-1.5 whitespace-nowrap px-4 py-[13px] text-[13.5px] font-semibold text-[#EAF2EC] transition-colors duration-200 group-hover/nav:bg-black/20 group-hover/nav:text-white group-focus-within/nav:bg-black/20"
        >
          {shortNavLabel(item.label || dept.name)}
          {hasPanel && (
            <ChevronDown className="h-[11px] w-[11px] opacity-70" strokeWidth={2} />
          )}
        </Link>

        {/* The panel's contents are drawn in the browser (MegaMenuPanels.tsx). */}
        {hasPanel && <LazyDeptPanel index={i} navKey={navItemKey(item)} />}
      </li>
    );
  }

  // Custom link (link / page / blog), with an optional simple dropdown.
  const children = item.children ?? [];
  return (
    <li key={`l-${i}`} data-nav-item className="group/nav relative shrink-0">
      <Link
        href={itemHref(item, byId)}
        target={item.newTab ? "_blank" : undefined}
        className="flex h-full items-center gap-1.5 whitespace-nowrap px-4 py-[13px] text-[13.5px] font-semibold text-[#EAF2EC] transition-colors duration-200 group-hover/nav:bg-black/20 group-hover/nav:text-white group-focus-within/nav:bg-black/20"
      >
        {item.label}
        {children.length > 0 && (
          <ChevronDown className="h-[11px] w-[11px] opacity-70" strokeWidth={2} />
        )}
      </Link>
      {children.length > 0 && <LazyLinkDropdown index={i} navKey={navItemKey(item)} />}
    </li>
  );
}
