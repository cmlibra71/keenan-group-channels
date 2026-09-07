import Link from "next/link";
import Image from "next/image";
import { Menu, ChevronDown, Star } from "lucide-react";
import type { MegaMenuFeatured } from "@/lib/store";
import {
  flattenTree,
  itemHref,
  panelColumns,
  panelExtras,
  splitNavItems,
  type MegaMenuNodeLike,
  type MegaNavItem,
} from "@/lib/mega-menu";
import { ikNavItems } from "@/lib/ik-nav";
import { MegaMenuShell } from "./MegaMenuShell";

/**
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
 * Pure server component — panels open on hover and :focus-within, so it is
 * keyboard operable without JS. Hidden below xl (the MobileNavDrawer takes
 * over, from the same resolved items).
 */
export function MegaMenu({
  departments,
  featured,
  items,
  hiddenCategoryIds,
}: {
  departments: MegaMenuNodeLike[];
  featured: Record<string, MegaMenuFeatured>;
  items?: MegaNavItem[];
  hiddenCategoryIds?: number[];
}) {
  // One list for the bar, the phone drawer and the /products strip — see
  // `ikNavItems`, which also owns the red "All Categories" launcher.
  const navItems = ikNavItems({ departments, items, hiddenCategoryIds });
  const byId = flattenTree(departments);
  const { left, right } = splitNavItems(navItems);

  return (
    <MegaMenuShell className="relative hidden bg-zinc-900 xl:block">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <ul data-nav-bar className="flex flex-nowrap items-stretch gap-0.5 overflow-hidden">
          {left.map((item, i) => renderItem(item, i, byId, featured))}

          {/* Overflow — shown by MegaMenuShell only when the bar runs out of row */}
          <li
            data-nav-more
            style={{ display: "none" }}
            className="group/nav relative shrink-0"
          >
            <button
              type="button"
              className="flex h-full items-center gap-1.5 whitespace-nowrap px-4 py-[13px] text-[13.5px] font-semibold text-zinc-200 transition-colors duration-200 group-hover/nav:bg-black/30 group-hover/nav:text-white group-focus-within/nav:bg-black/30"
              aria-haspopup="true"
            >
              More
              <ChevronDown className="h-[11px] w-[11px] opacity-70" strokeWidth={2} />
            </button>
            <div className="mega-panel invisible absolute h-0 overflow-hidden right-0 top-full z-[110] min-w-[220px] rounded-b-lg border border-zinc-200 bg-white py-2 opacity-0 shadow-lg transition-all delay-0 duration-150 group-hover/nav:visible group-hover/nav:h-auto group-hover/nav:overflow-visible group-hover/nav:opacity-100 group-hover/nav:delay-[150ms] group-focus-within/nav:visible group-focus-within/nav:h-auto group-focus-within/nav:overflow-visible group-focus-within/nav:opacity-100">
              {left.map((item, i) => (
                <Link
                  key={`m-${i}`}
                  data-more-index={i}
                  style={{ display: "none" }}
                  href={itemHref(item, byId)}
                  target={item.newTab ? "_blank" : undefined}
                  className="block px-4 py-2 text-[13.5px] text-zinc-700 transition-colors hover:bg-zinc-50 hover:text-[#C73629]"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </li>

          <li className="flex-1" aria-hidden />

          {right.map((item, i) => {
            // The right-hand slot is the CLEARANCE slot, and only Clearance
            // wears its amber promotion styling. Anything else that lands there
            // (IK's saved header ends with a Finance page link) is an ordinary
            // nav item and must not read as an offer — card mOTgYEvX.
            const href = itemHref(item, byId);
            const isClearance = href === "/clearance";
            return (
              <li key={`r-${i}`} data-nav-right className="shrink-0">
                <Link
                  href={href}
                  target={item.newTab ? "_blank" : undefined}
                  className={`flex h-full items-center gap-1.5 whitespace-nowrap px-3 py-[13px] text-[13px] transition-colors duration-200 ${
                    isClearance
                      ? "font-bold text-amber-400 hover:text-amber-300"
                      : "font-semibold text-zinc-200 hover:text-white"
                  }`}
                >
                  {isClearance && <Star className="h-3.5 w-3.5 fill-current" />}
                  {item.label}
                </Link>
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
  featured: Record<string, MegaMenuFeatured>
) {
  if (item.type === "categories") {
    return (
      <li key={`l-${i}`} data-nav-item className="shrink-0">
        <Link
          href="/categories"
          className="flex h-full items-center gap-2 whitespace-nowrap bg-[#D94B2B] px-4 py-[13px] text-[13.5px] font-bold text-white transition-colors duration-200 hover:bg-[#C73629]"
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
    const extras = panelExtras(item);
    return (
      <li key={`l-${i}`} data-nav-item className="group/nav shrink-0">
        <Link
          href={`/categories/${dept.slug}`}
          className="flex h-full items-center gap-1.5 whitespace-nowrap px-4 py-[13px] text-[13.5px] font-semibold text-zinc-200 transition-colors duration-200 group-hover/nav:bg-black/30 group-hover/nav:text-white group-focus-within/nav:bg-black/30"
        >
          {/* The bar prints the wording somebody actually chose. Chefs Depot
              shortens its department labels (`shortNavLabel`) to squeeze more
              onto one row; Industry Kitchens does not, and never has — its
              editor items are named "Catering Equipment" and "Kitchen
              Equipment", which shorten to "Catering" and "Kitchen" and would
              sit meaninglessly next to "Catering Supplies". Row length is not
              the reason to trim any more: the browser-measured More overflow
              below takes whatever does not fit. Card mOTgYEvX. */}
          {item.label || dept.name}
          {(dept.children.length > 0 || extras.length > 0) && (
            <ChevronDown className="h-[11px] w-[11px] opacity-70" strokeWidth={2} />
          )}
        </Link>

        {(dept.children.length > 0 || extras.length > 0) && (
          <MegaPanel dept={dept} feat={featured[String(dept.id)]} extras={extras} byId={byId} />
        )}
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
        className="flex h-full items-center gap-1.5 whitespace-nowrap px-4 py-[13px] text-[13.5px] font-semibold text-zinc-200 transition-colors duration-200 group-hover/nav:bg-black/30 group-hover/nav:text-white group-focus-within/nav:bg-black/30"
      >
        {item.label}
        {children.length > 0 && (
          <ChevronDown className="h-[11px] w-[11px] opacity-70" strokeWidth={2} />
        )}
      </Link>
      {children.length > 0 && (
        <div className="mega-panel invisible absolute h-0 overflow-hidden left-0 top-full z-50 min-w-[220px] rounded-b-lg border border-zinc-200 bg-white py-2 opacity-0 shadow-lg transition-all delay-0 duration-150 group-hover/nav:visible group-hover/nav:h-auto group-hover/nav:overflow-visible group-hover/nav:opacity-100 group-hover/nav:delay-[300ms] group-focus-within/nav:visible group-focus-within/nav:h-auto group-focus-within/nav:overflow-visible group-focus-within/nav:opacity-100">
          {children.map((child, j) => (
            <Link
              key={j}
              href={itemHref(child, byId)}
              target={child.newTab ? "_blank" : undefined}
              className="block px-4 py-2 text-[13.5px] text-zinc-700 transition-colors hover:bg-zinc-50 hover:text-[#C73629]"
            >
              {child.label}
            </Link>
          ))}
        </div>
      )}
    </li>
  );
}

function MegaPanel({
  dept,
  feat,
  extras,
  byId,
}: {
  dept: MegaMenuNodeLike;
  feat?: MegaMenuFeatured;
  extras: MegaNavItem[];
  byId: Map<number, MegaMenuNodeLike>;
}) {
  // 3 link columns: depth-1 children become column groups, balanced across
  // columns; their children are the links (the group itself when childless).
  const columns = panelColumns(dept.children);

  // The panel is full-bleed and drops straight over the page below the bar (the
  // breadcrumb sits ~50px under it), so two guards keep it from stealing clicks
  // meant for the page: a hover-intent delay, so merely sweeping the pointer
  // down across a department never opens it (it stays `invisible`, and hidden
  // means un-hoverable, so the delayed transition is abandoned); and
  // pointer-events only on the white card, so the transparent gutters beside it
  // are click-through. Keyboard (:focus-within) opens with no delay.
  //
  // A CLOSED panel is ZERO HEIGHT (`h-0 overflow-hidden`), not merely invisible.
  // `html, body { overflow-x: hidden }` (globals.css) makes BODY its own scroll
  // container, so an absolutely positioned box hanging below the page still adds
  // that much scrollable overflow inside it — and the Industry Kitchens Brands
  // panel is 5,700px tall. On any page shorter than the panel (every /pages/*)
  // the reader could wheel straight past the footer into empty space with the
  // menu shut, which is what card Qt0yPLCl reported. The white card is capped at
  // the viewport and scrolls inside itself, so an OPEN panel cannot hang below
  // the fold and put the overflow back either.
  return (
    <div
      className="mega-panel pointer-events-none invisible absolute left-0 right-0 top-full z-[110] h-0 translate-y-2 overflow-hidden opacity-0 transition-all delay-0 duration-200
                 group-hover/nav:visible group-hover/nav:h-auto group-hover/nav:translate-y-0 group-hover/nav:overflow-visible group-hover/nav:opacity-100 group-hover/nav:delay-[300ms]
                 group-focus-within/nav:visible group-focus-within/nav:h-auto group-focus-within/nav:translate-y-0 group-focus-within/nav:overflow-visible group-focus-within/nav:opacity-100"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="pointer-events-none grid max-w-[1100px] grid-cols-[1fr_1fr_1fr_240px] gap-6 max-h-[calc(100vh-14rem)] overflow-y-auto rounded-b-lg border border-zinc-200 border-t-[3px] border-t-[#D94B2B] bg-white p-6 shadow-lg group-hover/nav:pointer-events-auto group-focus-within/nav:pointer-events-auto">
          {columns.map((col, i) => (
            <div key={i} className="space-y-5">
              {col.map((group) => (
                <div key={group.id}>
                  <Link
                    href={`/categories/${group.slug}`}
                    className="mb-2 block border-b border-zinc-200 pb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[#C73629] hover:text-[#D94B2B]"
                  >
                    {group.name}
                  </Link>
                  {group.children.slice(0, 7).map((leaf) => (
                    <Link
                      key={leaf.id}
                      href={`/categories/${leaf.slug}`}
                      className="block py-[5px] text-[13px] text-zinc-700 transition-colors duration-200 hover:text-[#D94B2B]"
                    >
                      {leaf.name}
                    </Link>
                  ))}
                  {group.children.length > 7 && (
                    <Link
                      href={`/categories/${group.slug}`}
                      className="block py-[5px] text-[13px] font-semibold text-[#D94B2B] hover:text-[#C73629]"
                    >
                      View all →
                    </Link>
                  )}
                </div>
              ))}
            </div>
          ))}

          <div className="flex flex-col gap-4 self-start">
            {/* Featured panel — self-start so it stays a compact card (image + copy)
                instead of stretching to the full mega-menu row height. */}
            <div className="flex flex-col overflow-hidden rounded-lg bg-zinc-50">
              <div className="relative grid h-[120px] place-items-center bg-gradient-to-br from-zinc-700 to-zinc-900">
                {(feat?.image_url ?? dept.image_url) && (
                  <Image src={(feat?.image_url ?? dept.image_url)!} alt="" fill sizes="240px" className="object-cover" />
                )}
              </div>
              <div className="p-3.5">
                <b className="mb-0.5 block text-sm text-zinc-900">
                  {feat?.heading ?? `Shop ${dept.name}`}
                </b>
                <p className="mb-2.5 text-xs text-zinc-500">
                  {feat?.body ?? "Explore the full range."}
                </p>
                <Link
                  href={feat?.cta_href ?? `/categories/${dept.slug}`}
                  className="inline-flex items-center rounded-md bg-[#D94B2B] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#C73629]"
                >
                  {feat?.cta_text ?? "Shop now"}
                </Link>
              </div>
            </div>

            {/* Information pages tucked inside this department by the editor */}
            {extras.length > 0 && (
              <div className="border-t border-zinc-200 pt-3">
                {extras.map((extra, j) => (
                  <Link
                    key={j}
                    href={itemHref(extra, byId)}
                    target={extra.newTab ? "_blank" : undefined}
                    className="block py-[5px] text-[13px] font-medium text-zinc-700 transition-colors duration-200 hover:text-[#D94B2B]"
                  >
                    {extra.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
