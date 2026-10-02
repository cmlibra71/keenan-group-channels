"use client";

import Link from "next/link";
import Image from "next/image";
import { ChevronDown } from "lucide-react";
import {
  ALL_BRANDS_HREF,
  itemHref,
  panelBrandColumn,
  subcategoryColumnCount,
  type MegaBrandLike,
  type MegaMenuFeaturedLike,
  type MegaMenuNodeLike,
  type MegaNavItem,
} from "@/lib/mega-menu";
import {
  ikBalanceColumns,
  ikBarHref,
  ikPanelGroups,
  type IkMegaMenuSettings,
  type IkPanelGroup,
} from "@/lib/ik-mega-panel";
import { findNavItem, LONG_LINK_DROPDOWN } from "@/lib/nav-model";
import { useNavData } from "@/lib/nav-data-client";

/**
 * The drop-downs of the department bar (MegaMenu.tsx), drawn in the browser from
 * the menu data NavDataProvider loads — so the hundreds of links inside them are
 * no longer rendered into every page (see lib/nav-model.ts). The markup is
 * exactly what the server used to render; until the data arrives each renders
 * nothing, which looks the same as a CLOSED panel (zero height, invisible).
 *
 * Each is placed by the server at its bar item's position (`index`) and checks
 * it is still that item (`navKey`), in case the menu was edited since the page
 * rendered.
 */
type Placement = { index: number; navKey: string };

/** A department's panel (the left side of the bar). */
export function LazyDeptPanel({ index, navKey }: Placement) {
  const { model } = useNavData();
  if (!model) return null;
  const item = findNavItem(model.left, index, navKey);
  const dept = item?.categoryId ? model.byId.get(item.categoryId) : undefined;
  if (!item || !dept) return null;
  const { settings, featured, brandColumns } = model.data;
  const { groups, extras, ordered } = ikPanelGroups(dept, item, model.byId, settings);
  const brandColumn = panelBrandColumn(item);
  return (
    <MegaPanel
      dept={dept}
      label={item.label || dept.name}
      skipHref={skipHref(index, model.left.length)}
      groups={groups}
      ordered={ordered}
      feat={featured[String(dept.id)]}
      extras={extras}
      byId={model.byId}
      brandHeading={brandColumn ? brandColumn.label || "Brands" : null}
      brands={brandColumn ? brandColumns[dept.id] ?? [] : []}
    />
  );
}

// Keyboard: a panel opens on :focus-within, so a long one (Brands, Business Type) would make the
// keyboard walk every link to reach the next department. Each panel starts with a skip link to the
// next bar item (the right-hand slot after the last one).
function skipHref(i: number, count: number) {
  return i + 1 < count ? `#nav-item-${i + 1}` : "#nav-right";
}

/** A custom link's drop-down on the left of the bar. */
export function LazyLinkDropdown({ index, navKey }: Placement) {
  const { model } = useNavData();
  if (!model) return null;
  const item = findNavItem(model.left, index, navKey);
  if (!item) return null;
  const byId = model.byId;
  const children = item.children ?? [];
  // A long link drop-down (Industry Kitchens' Brands: the old menu's 387 brands) becomes a capped,
  // scrolling panel of columns that read top to bottom; a short one stays the small list it was.
  const long = children.length > LONG_LINK_DROPDOWN;
  const columnCount = long ? 4 : 1;
  const rows = Math.ceil(children.length / columnCount);
  if (children.length === 0) return null;
  if (long) {
    return (
      <div className="mega-panel pointer-events-none invisible absolute left-0 right-0 top-full z-[110] h-0 overflow-hidden opacity-0 transition-all delay-0 duration-150 group-hover/nav:visible group-hover/nav:h-auto group-hover/nav:overflow-visible group-hover/nav:opacity-100 group-hover/nav:delay-[300ms] group-focus-within/nav:visible group-focus-within/nav:h-auto group-focus-within/nav:overflow-visible group-focus-within/nav:opacity-100">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="pointer-events-none max-h-[calc(100vh-14rem)] max-w-[1100px] overflow-y-auto rounded-b-lg border border-zinc-200 border-t-[3px] border-t-[#D94B2B] bg-white py-3 shadow-lg group-hover/nav:pointer-events-auto group-focus-within/nav:pointer-events-auto">
            <a
              href={skipHref(index, model.left.length)}
              className="sr-only focus:not-sr-only focus:block focus:px-4 focus:py-1.5 focus:text-[13px] focus:text-zinc-800"
            >
              Skip the {item.label} menu
            </a>
            <div
              className="grid grid-flow-col gap-x-4"
              style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, auto)` }}
            >
              {children.map((child, j) => (
                <Link
                  key={j}
                  href={itemHref(child, byId)}
                  target={child.newTab ? "_blank" : undefined}
                  className="block px-4 py-1 text-[13.5px] text-zinc-700 transition-colors hover:bg-zinc-50 hover:text-[#C73629]"
                >
                  {child.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="mega-panel invisible absolute left-0 top-full z-50 h-0 min-w-[220px] overflow-hidden rounded-b-lg border border-zinc-200 bg-white py-2 opacity-0 shadow-lg transition-all delay-0 duration-150 group-hover/nav:visible group-hover/nav:h-auto group-hover/nav:overflow-visible group-hover/nav:opacity-100 group-hover/nav:delay-[300ms] group-focus-within/nav:visible group-focus-within/nav:h-auto group-focus-within/nav:overflow-visible group-focus-within/nav:opacity-100">
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
  );
}

/** A right-hand slot item's small drop-down (the old bar's Clearance Sale), opening leftwards. */
export function LazyRightDropdown({ index, navKey }: Placement) {
  const { model } = useNavData();
  if (!model) return null;
  const item = findNavItem(model.right, index, navKey);
  const kids = item?.children ?? [];
  if (kids.length === 0) return null;
  return (
    <div className="mega-panel invisible absolute right-0 top-full z-50 h-0 min-w-[220px] overflow-hidden rounded-b-lg border border-zinc-200 bg-white py-2 opacity-0 shadow-lg transition-all delay-0 duration-150 group-hover/nav:visible group-hover/nav:h-auto group-hover/nav:overflow-visible group-hover/nav:opacity-100 group-hover/nav:delay-[300ms] group-focus-within/nav:visible group-focus-within/nav:h-auto group-focus-within/nav:overflow-visible group-focus-within/nav:opacity-100">
      {kids.map((child, j) => (
        <Link
          key={j}
          href={itemHref(child, model.byId)}
          target={child.newTab ? "_blank" : undefined}
          className="block px-4 py-2 text-[13.5px] text-zinc-700 transition-colors hover:bg-zinc-50 hover:text-[#C73629]"
        >
          {child.label}
        </Link>
      ))}
    </div>
  );
}

/** The contents of one entry under the bar's More menu (its wrapper stays server-rendered). */
export function LazyMoreEntry({ index, navKey }: Placement) {
  const { model } = useNavData();
  if (!model) return null;
  const item = findNavItem(model.left, index, navKey);
  if (!item) return null;
  return <MoreEntry item={item} byId={model.byId} settings={model.data.settings} brandColumns={model.data.brandColumns} />;
}

function MegaPanel({
  dept,
  label,
  skipHref,
  groups,
  ordered,
  feat,
  extras,
  byId,
  brandHeading,
  brands,
}: {
  dept: MegaMenuNodeLike;
  label: string;
  /** Where the panel's skip link sends keyboard focus (the next bar item). */
  skipHref: string;
  /** The department's columns (`ikPanelGroups`): its sub-categories plus the editor's column links. */
  groups: IkPanelGroup[];
  /** The editor named the columns: lay them out top to bottom in that order. */
  ordered: boolean;
  feat?: MegaMenuFeaturedLike;
  extras: MegaNavItem[];
  byId: Map<number, MegaMenuNodeLike>;
  /** The Brands column's heading, or null when this department has none. */
  brandHeading: string | null;
  brands: MegaBrandLike[];
}) {
  // 3 link columns: depth-1 children become column groups, balanced across
  // columns; their children are the links (the group itself when childless).
  // A Brands column (card HaWBvySC) takes the last of the three.
  const columns = ikBalanceColumns(groups, subcategoryColumnCount(brandHeading !== null), ordered);

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
          <a
            href={skipHref}
            className="sr-only focus:not-sr-only focus:col-span-full focus:rounded focus:bg-zinc-100 focus:px-3 focus:py-1.5 focus:text-[13px] focus:text-zinc-800"
          >
            Skip the {label} menu
          </a>
          {columns.map((col, i) => (
            <div key={i} className="space-y-5">
              {col.map((group) => (
                <div key={group.key}>
                  <Link
                    href={group.href}
                    target={group.newTab ? "_blank" : undefined}
                    className="mb-2 block border-b border-zinc-200 pb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[#C73629] hover:text-[#D94B2B]"
                  >
                    {group.label}
                  </Link>
                  {group.links.map((leaf) => (
                    <Link
                      key={leaf.key}
                      href={leaf.href}
                      target={leaf.newTab ? "_blank" : undefined}
                      className="block py-[5px] text-[13px] text-zinc-700 transition-colors duration-200 hover:text-[#D94B2B]"
                    >
                      {leaf.label}
                    </Link>
                  ))}
                  {group.moreHref && (
                    <Link
                      href={group.moreHref}
                      className="block py-[5px] text-[13px] font-semibold text-[#D94B2B] hover:text-[#C73629]"
                    >
                      View all →
                    </Link>
                  )}
                </div>
              ))}
            </div>
          ))}

          {/* Brands column — words only, no logos (Steve: no pictures in a
              drop-down). Staff's chosen brands, else this department's busiest
              brands on this storefront (card HaWBvySC). */}
          {brandHeading !== null && (
            <div className="space-y-5">
              <div>
                <Link
                  href={ALL_BRANDS_HREF}
                  className="mb-2 block border-b border-zinc-200 pb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[#C73629] hover:text-[#D94B2B]"
                >
                  {brandHeading}
                </Link>
                {brands.map((brand) => (
                  <Link
                    key={brand.id}
                    href={`/brands/${brand.slug}`}
                    className="block py-[5px] text-[13px] text-zinc-700 transition-colors duration-200 hover:text-[#D94B2B]"
                  >
                    {brand.name}
                  </Link>
                ))}
                <Link
                  href={ALL_BRANDS_HREF}
                  className="block py-[5px] text-[13px] font-semibold text-[#D94B2B] hover:text-[#C73629]"
                >
                  View all brands →
                </Link>
              </div>
            </div>
          )}

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

/** One item under the bar's More menu: a plain link, or — when it has a drop-down — an expandable
 *  entry listing that drop-down's headings and links (option 3 of the IK menu decision). Plain
 *  <details> markup, so it opens by keyboard with no extra script. */
function MoreEntry({
  item,
  byId,
  settings,
  brandColumns,
}: {
  item: MegaNavItem;
  byId: Map<number, MegaMenuNodeLike>;
  settings: IkMegaMenuSettings;
  brandColumns: Record<number, MegaBrandLike[]>;
}) {
  const href = ikBarHref(item, byId);
  const dept = item.type === "category" && item.categoryId ? byId.get(item.categoryId) : undefined;
  const panel = dept ? ikPanelGroups(dept, item, byId, settings) : null;
  const brandColumn = dept ? panelBrandColumn(item) : null;
  const groups: IkPanelGroup[] = panel
    ? [
        ...panel.groups,
        // The bar panel's Brands column and information links, so the More entry lists everything
        // the drop-down does (judge note).
        ...(brandColumn
          ? [{ key: "brands", label: brandColumn.label || "Brands", href: ALL_BRANDS_HREF, links: (brandColumns[dept!.id] ?? []).map((b) => ({ key: `b${b.id}`, label: b.name, href: `/brands/${b.slug}` })), total: 0 }]
          : []),
        ...panel.extras.map((e, j) => ({ key: `e${j}`, label: e.label, href: itemHref(e, byId), newTab: e.newTab || undefined, links: [], total: 0 })),
      ]
    : (item.children ?? [])
        .filter((c) => c.label)
        .map((c, j) => ({ key: `c${j}`, label: c.label, href: itemHref(c, byId), newTab: c.newTab || undefined, links: [], total: 0 }));
  const rowClass = "block px-4 py-2 text-[13.5px] text-zinc-700 transition-colors hover:bg-zinc-50 hover:text-[#C73629]";
  if (groups.length === 0) {
    return (
      <Link href={href} target={item.newTab ? "_blank" : undefined} className={rowClass}>
        {item.label}
      </Link>
    );
  }
  return (
    <details className="group/more">
      <summary className="flex cursor-pointer list-none items-center [&::-webkit-details-marker]:hidden justify-between px-4 py-2 text-[13.5px] text-zinc-700 hover:bg-zinc-50 hover:text-[#C73629]">
        {item.label}
        <ChevronDown className="h-3 w-3 opacity-60 transition-transform group-open/more:rotate-180" strokeWidth={2} />
      </summary>
      <div className="border-l-2 border-zinc-100 ml-4 pb-1">
        <Link href={href} target={item.newTab ? "_blank" : undefined} className="block px-3 py-1.5 text-[13px] font-semibold text-[#D94B2B] hover:text-[#C73629]">
          All {item.label}
        </Link>
        {groups.map((g) => (
          <div key={g.key}>
            <Link href={g.href} target={g.newTab ? "_blank" : undefined} className={`block px-3 py-1.5 text-[13px] ${g.links.length ? "font-semibold text-zinc-900" : "text-zinc-700"} hover:text-[#D94B2B]`}>
              {g.label}
            </Link>
            {g.links.map((l) => (
              <Link key={l.key} href={l.href} target={l.newTab ? "_blank" : undefined} className="block py-1 pl-6 pr-3 text-[12.5px] text-zinc-600 hover:text-[#D94B2B]">
                {l.label}
              </Link>
            ))}
            {g.moreHref && (
              <Link href={g.moreHref} className="block py-1 pl-6 pr-3 text-[12.5px] font-semibold text-[#D94B2B]">
                View all →
              </Link>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}
