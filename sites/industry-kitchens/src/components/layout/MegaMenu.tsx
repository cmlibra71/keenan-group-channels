import Link from "next/link";
import { Menu, ChevronDown, Star } from "lucide-react";
import { itemHref, panelBrandColumn, type MegaMenuNodeLike, type MegaNavItem } from "@/lib/mega-menu";
import { ikBarHref, ikIsHighlighted, ikPanelGroups, type IkMegaMenuSettings } from "@/lib/ik-mega-panel";
import { LONG_LINK_DROPDOWN, navItemKey, navModel, type NavData } from "@/lib/nav-model";
import { LazyDeptPanel, LazyLinkDropdown, LazyMoreEntry, LazyRightDropdown } from "./MegaMenuPanels";
import { MegaMenuShell } from "./MegaMenuShell";

/**
 * BAR TYPE AND SPACING ARE DESIGN TOKENS (IK menu parity, 2026-10-01): `--nav-font-size`,
 * `--nav-item-pl`, `--nav-item-pr`, `--nav-item-py`, set in the storefront's design tokens (custom
 * group) and emitted on <html> by the root layout. Unset = the values this bar has always used.
 *
 * Dark nav bar with CSS-driven mega panels — Industry Kitchens' own styling
 * (red accent, `xl` breakpoint) over the SHARED composition (card mOTgYEvX).
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
 * (MegaMenuPanels.tsx, lib/nav-model.ts): they were ~1.2 MB of every page.
 * Panels still open on pure-CSS hover and :focus-within. Hidden below xl (the
 * MobileNavDrawer takes over, from the same resolved items).
 */
export function MegaMenu({ data }: { data: NavData }) {
  // One list for the bar, the phone drawer and the /products strip — see
  // `ikNavItems`, which also owns the red "All Categories" launcher.
  const { left, right, byId } = navModel(data);
  const settings = data.settings;

  return (
    <MegaMenuShell className="relative hidden bg-zinc-900 xl:block">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <ul data-nav-bar className="flex flex-nowrap items-stretch gap-0.5 overflow-hidden">
          {left.map((item, i) => renderItem(item, i, byId, settings))}

          {/* Overflow — shown by MegaMenuShell only when the bar runs out of row */}
          <li
            data-nav-more
            style={{ display: "none" }}
            className="group/nav relative shrink-0"
          >
            <button
              type="button"
              className="flex h-full items-center gap-1.5 whitespace-nowrap pl-[var(--nav-item-pl,1rem)] pr-[var(--nav-item-pr,1rem)] py-[var(--nav-item-py,13px)] text-[length:var(--nav-font-size,13.5px)] font-semibold text-zinc-200 transition-colors duration-200 group-hover/nav:bg-black/30 group-hover/nav:text-white group-focus-within/nav:bg-black/30"
              aria-haspopup="true"
            >
              More
              <ChevronDown className="h-[0.815em] w-[0.815em] opacity-70" strokeWidth={2} />
            </button>
            <div className="mega-panel invisible absolute h-0 overflow-hidden right-0 top-full z-[110] min-w-[260px] max-w-[min(420px,90vw)] rounded-b-lg border border-zinc-200 bg-white py-2 opacity-0 shadow-lg transition-all delay-0 duration-150 group-hover/nav:visible group-hover/nav:h-auto group-hover/nav:max-h-[calc(100vh-14rem)] group-hover/nav:overflow-y-auto group-hover/nav:opacity-100 group-hover/nav:delay-[150ms] group-focus-within/nav:visible group-focus-within/nav:h-auto group-focus-within/nav:max-h-[calc(100vh-14rem)] group-focus-within/nav:overflow-y-auto group-focus-within/nav:opacity-100">
              {left.map((item, i) => (
                // Fallback when the bar still runs out of room: an item tucked under More keeps
                // its drop-down as an expandable entry (headings and links), not a bare link.
                <div key={`m-${i}`} data-more-index={i} style={{ display: "none" }}>
                  <LazyMoreEntry index={i} navKey={navItemKey(item)} />
                </div>
              ))}
            </div>
          </li>

          <li className="flex-1" aria-hidden />

          {right.map((item, i) => {
            // The right-hand slot is the CLEARANCE slot, and only Clearance
            // wears its amber promotion styling. Anything else that lands there
            // (IK's saved header ends with a Finance page link) is an ordinary
            // nav item and must not read as an offer — card mOTgYEvX. A
            // highlighted item keeps its small drop-down here (the old bar's
            // Clearance Sale), opening leftwards so it stays on screen.
            const href = ikBarHref(item, byId);
            const isClearance = ikIsHighlighted(item, href, true);
            const kids = item.children ?? [];
            return (
              <li key={`r-${i}`} data-nav-right className="group/nav relative shrink-0">
                <Link
                  id={i === 0 ? "nav-right" : undefined}
                  href={href}
                  target={item.newTab ? "_blank" : undefined}
                  className={`flex h-full items-center gap-1.5 whitespace-nowrap pl-[var(--nav-item-pl,0.75rem)] pr-[var(--nav-item-pr,0.75rem)] py-[var(--nav-item-py,13px)] text-[length:var(--nav-font-size,13px)] transition-colors duration-200 ${
                    isClearance
                      ? "font-bold text-amber-400 hover:text-amber-300"
                      : "font-semibold text-zinc-200 hover:text-white"
                  }`}
                >
                  {isClearance && <Star className="h-[1.077em] w-[1.077em] fill-current" />}
                  {item.label}
                  {kids.length > 0 && <ChevronDown className="h-[0.815em] w-[0.815em] opacity-70" strokeWidth={2} />}
                </Link>
                {kids.length > 0 && <LazyRightDropdown index={i} navKey={navItemKey(item)} />}
              </li>
            );
          })}
        </ul>
      </div>
    </MegaMenuShell>
  );
}

function renderItem(
  item: MegaNavItem,
  i: number,
  byId: Map<number, MegaMenuNodeLike>,
  settings: IkMegaMenuSettings
) {
  if (item.type === "categories") {
    return (
      <li key={`l-${i}`} data-nav-item className="shrink-0">
        <Link
          href="/categories"
          className="flex h-full items-center gap-2 whitespace-nowrap bg-[#D94B2B] pl-[var(--nav-item-pl,1rem)] pr-[var(--nav-item-pr,1rem)] py-[var(--nav-item-py,13px)] text-[length:var(--nav-font-size,13.5px)] font-bold text-white transition-colors duration-200 hover:bg-[#C73629]"
        >
          <Menu className="h-4 w-4" strokeWidth={2.2} />
          {item.label || "All Categories"}
        </Link>
      </li>
    );
  }

  if (item.type === "category" && item.categoryId) {
    const dept = byId.get(item.categoryId);
    if (!dept) return null; // hidden/deleted category — drop the item
    const { groups, extras } = ikPanelGroups(dept, item, byId, settings);
    const brandColumn = panelBrandColumn(item);
    const hasPanel = groups.length > 0 || extras.length > 0 || !!brandColumn;
    const barHref = ikBarHref(item, byId);
    const highlighted = ikIsHighlighted(item, barHref, false);
    return (
      <li key={`l-${i}`} data-nav-item className="group/nav shrink-0">
        <Link
          id={`nav-item-${i}`}
          href={barHref}
          target={item.newTab ? "_blank" : undefined}
          className={`flex h-full items-center gap-1.5 whitespace-nowrap pl-[var(--nav-item-pl,1rem)] pr-[var(--nav-item-pr,1rem)] py-[var(--nav-item-py,13px)] text-[length:var(--nav-font-size,13.5px)] transition-colors duration-200 group-hover/nav:bg-black/30 group-focus-within/nav:bg-black/30 ${
            highlighted ? "font-bold text-amber-400 group-hover/nav:text-amber-300" : "font-semibold text-zinc-200 group-hover/nav:text-white"
          }`}
        >
          {highlighted && <Star className="h-[1.04em] w-[1.04em] fill-current" />}
          {/* The bar prints the wording somebody actually chose. Chefs Depot
              shortens its department labels (`shortNavLabel`) to squeeze more
              onto one row; Industry Kitchens does not, and never has — its
              editor items are named "Catering Equipment" and "Kitchen
              Equipment", which shorten to "Catering" and "Kitchen" and would
              sit meaninglessly next to "Catering Supplies". Row length is not
              the reason to trim any more: the browser-measured More overflow
              below takes whatever does not fit. Card mOTgYEvX. */}
          {item.label || dept.name}
          {hasPanel && (
            <ChevronDown className="h-[0.815em] w-[0.815em] opacity-70" strokeWidth={2} />
          )}
        </Link>

        {/* The panel's contents are drawn in the browser (MegaMenuPanels.tsx). */}
        {hasPanel && <LazyDeptPanel index={i} navKey={navItemKey(item)} />}
      </li>
    );
  }

  // Custom link (link / page / blog), with an optional simple dropdown.
  const children = item.children ?? [];
  const linkHref = itemHref(item, byId);
  // A long link drop-down (Industry Kitchens' Brands: the old menu's 387 brands) becomes a capped,
  // scrolling panel of columns that read top to bottom; a short one stays the small list it was.
  const long = children.length > LONG_LINK_DROPDOWN;
  const linkHighlighted = ikIsHighlighted(item, linkHref, false);
  return (
    // A long list's panel spans the BAR (the li is not its positioning box), centred in the page
    // like the department panels, so it can never run past the viewport (judge: a panel centred on
    // the Brands item overflowed by up to 199px at 1280px). A short list stays under its own item.
    <li key={`l-${i}`} data-nav-item className={`group/nav shrink-0 ${long ? "" : "relative"}`}>
      <Link
        id={`nav-item-${i}`}
        href={linkHref}
        target={item.newTab ? "_blank" : undefined}
        className={`flex h-full items-center gap-1.5 whitespace-nowrap pl-[var(--nav-item-pl,1rem)] pr-[var(--nav-item-pr,1rem)] py-[var(--nav-item-py,13px)] text-[length:var(--nav-font-size,13.5px)] transition-colors duration-200 group-hover/nav:bg-black/30 group-focus-within/nav:bg-black/30 ${
          linkHighlighted ? "font-bold text-amber-400 group-hover/nav:text-amber-300" : "font-semibold text-zinc-200 group-hover/nav:text-white"
        }`}
      >
        {linkHighlighted && <Star className="h-[1.04em] w-[1.04em] fill-current" />}
        {item.label}
        {children.length > 0 && (
          <ChevronDown className="h-[0.815em] w-[0.815em] opacity-70" strokeWidth={2} />
        )}
      </Link>
      {children.length > 0 && <LazyLinkDropdown index={i} navKey={navItemKey(item)} />}
    </li>
  );
}
