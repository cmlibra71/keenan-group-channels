"use client";

import Link from "next/link";
import Image from "next/image";
import {
  ALL_BRANDS_HREF,
  itemHref,
  panelBrandColumn,
  panelColumns,
  panelExtras,
  subcategoryColumnCount,
  type MegaBrandLike,
  type MegaMenuFeaturedLike,
  type MegaMenuNodeLike,
  type MegaNavItem,
} from "@/lib/mega-menu";
import { findNavItem } from "@/lib/nav-model";
import { useNavData } from "@/lib/nav-data-client";

/**
 * The drop-downs of the department bar (MegaMenu.tsx), drawn in the browser from
 * the menu data NavDataProvider loads — so the links inside them are no longer
 * rendered into every page (see lib/nav-model.ts). The markup is exactly what the
 * server used to render; until the data arrives each renders nothing, which looks
 * the same as a CLOSED panel (zero height, invisible).
 *
 * Each is placed by the server at its bar item's position (`index`) and checks
 * it is still that item (`navKey`), in case the menu was edited since the page
 * rendered.
 */
type Placement = { index: number; navKey: string };

/** A department's panel. */
export function LazyDeptPanel({ index, navKey }: Placement) {
  const { model } = useNavData();
  if (!model) return null;
  const item = findNavItem(model.left, index, navKey);
  const dept = item?.categoryId ? model.byId.get(item.categoryId) : undefined;
  if (!item || !dept) return null;
  const brandColumn = panelBrandColumn(item);
  return (
    <MegaPanel
      dept={dept}
      feat={model.data.featured[String(dept.id)]}
      extras={panelExtras(item)}
      byId={model.byId}
      brandHeading={brandColumn ? brandColumn.label || "Brands" : null}
      brands={brandColumn ? model.data.brandColumns[dept.id] ?? [] : []}
    />
  );
}

/** A custom link's simple drop-down. */
export function LazyLinkDropdown({ index, navKey }: Placement) {
  const { model } = useNavData();
  if (!model) return null;
  const item = findNavItem(model.left, index, navKey);
  const children = item?.children ?? [];
  if (children.length === 0) return null;
  const byId = model.byId;
  return (
    <div className="mega-panel invisible absolute h-0 overflow-hidden left-0 top-full z-50 min-w-[220px] rounded-b-card border border-black/5 bg-white py-2 opacity-0 shadow-hover transition-all delay-0 duration-150 group-hover/nav:visible group-hover/nav:h-auto group-hover/nav:overflow-visible group-hover/nav:opacity-100 group-hover/nav:delay-[300ms] group-focus-within/nav:visible group-focus-within/nav:h-auto group-focus-within/nav:overflow-visible group-focus-within/nav:opacity-100">
      {children.map((child, j) => (
        <Link
          key={j}
          href={itemHref(child, byId)}
          target={child.newTab ? "_blank" : undefined}
          className="block px-4 py-2 text-[13.5px] text-text-primary transition-colors hover:bg-brand-tint hover:text-brand-deep"
        >
          {child.label}
        </Link>
      ))}
    </div>
  );
}

function MegaPanel({
  dept,
  feat,
  extras,
  byId,
  brandHeading,
  brands,
}: {
  dept: MegaMenuNodeLike;
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
  const columns = panelColumns(dept.children, subcategoryColumnCount(brandHeading !== null));

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
      <div className="container-page">
        <div className="pointer-events-none grid max-w-[1100px] grid-cols-[1fr_1fr_1fr_240px] gap-6 max-h-[calc(100vh-14rem)] overflow-y-auto rounded-b-card border border-border border-t-[3px] border-t-member bg-white p-6 shadow-lg group-hover/nav:pointer-events-auto group-focus-within/nav:pointer-events-auto">
          {columns.map((col, i) => (
            <div key={i} className="space-y-5">
              {col.map((group) => (
                <div key={group.id}>
                  <Link
                    href={`/categories/${group.slug}`}
                    className="mb-2 block border-b border-border pb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-accent-dark hover:text-accent"
                  >
                    {group.name}
                  </Link>
                  {group.children.slice(0, 7).map((leaf) => (
                    <Link
                      key={leaf.id}
                      href={`/categories/${leaf.slug}`}
                      className="block py-[5px] text-[13px] text-ink-700 transition-colors duration-200 hover:text-accent"
                    >
                      {leaf.name}
                    </Link>
                  ))}
                  {group.children.length > 7 && (
                    <Link
                      href={`/categories/${group.slug}`}
                      className="block py-[5px] text-[13px] font-semibold text-accent hover:text-accent-hover"
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
                  className="mb-2 block border-b border-border pb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-accent-dark hover:text-accent"
                >
                  {brandHeading}
                </Link>
                {brands.map((brand) => (
                  <Link
                    key={brand.id}
                    href={`/brands/${brand.slug}`}
                    className="block py-[5px] text-[13px] text-ink-700 transition-colors duration-200 hover:text-accent"
                  >
                    {brand.name}
                  </Link>
                ))}
                <Link
                  href={ALL_BRANDS_HREF}
                  className="block py-[5px] text-[13px] font-semibold text-accent hover:text-accent-hover"
                >
                  View all brands →
                </Link>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-4 self-start">
            {/* Featured panel — self-start so it stays a compact card (image + copy)
                instead of stretching to the full mega-menu row height. */}
            <div className="flex flex-col overflow-hidden rounded-card bg-brand-tint">
              <div className="relative grid h-[120px] place-items-center bg-gradient-to-br from-brand-mid to-brand-deep">
                {(feat?.image_url ?? dept.image_url) && (
                  <Image src={(feat?.image_url ?? dept.image_url)!} alt="" fill sizes="240px" className="object-cover" />
                )}
              </div>
              <div className="p-3.5">
                <b className="mb-0.5 block text-sm text-text-primary">
                  {feat?.heading ?? `Shop ${dept.name}`}
                </b>
                <p className="mb-2.5 text-xs text-steel-500">
                  {feat?.body ?? "Member pricing across the full range."}
                </p>
                <Link
                  href={feat?.cta_href ?? `/categories/${dept.slug}`}
                  className="btn-primary btn-sm"
                >
                  {feat?.cta_text ?? "Shop now"}
                </Link>
              </div>
            </div>

            {/* Information pages tucked inside this department by the editor */}
            {extras.length > 0 && (
              <div className="border-t border-border pt-3">
                {extras.map((extra, j) => (
                  <Link
                    key={j}
                    href={itemHref(extra, byId)}
                    target={extra.newTab ? "_blank" : undefined}
                    className="block py-[5px] text-[13px] font-medium text-ink-700 transition-colors duration-200 hover:text-accent"
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
