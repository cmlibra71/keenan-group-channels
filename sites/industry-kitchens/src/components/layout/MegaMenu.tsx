import Link from "next/link";
import Image from "next/image";
import { Menu, ChevronDown, Star } from "lucide-react";
import type { MegaMenuNode, MegaMenuFeatured } from "@/lib/store";
import { MegaMenuShell } from "./MegaMenuShell";

/**
 * Dark nav bar with CSS-driven mega panels: 3 link columns from the category
 * tree + a featured panel per department. Pure server component — open on
 * hover and :focus-within, so it's keyboard operable without JS. Hidden
 * below lg (the MobileNavDrawer takes over).
 */
export function MegaMenu({
  departments,
  featured,
}: {
  departments: MegaMenuNode[];
  featured: Record<string, MegaMenuFeatured>;
}) {
  return (
    <MegaMenuShell className="relative hidden bg-zinc-900 xl:block">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <ul className="flex items-stretch gap-0.5">
          <li>
            <Link
              href="/categories"
              className="flex h-full items-center gap-2 bg-[#D94B2B] px-4 py-[13px] text-[13.5px] font-bold text-white transition-colors duration-200 hover:bg-[#C73629]"
            >
              <Menu className="h-4 w-4" strokeWidth={2.2} />
              All Categories
            </Link>
          </li>

          {departments.slice(0, 7).map((dept) => (
            <li key={dept.id} className="group/nav">
              <Link
                href={`/categories/${dept.slug}`}
                className="flex h-full items-center gap-1.5 px-4 py-[13px] text-[13.5px] font-semibold text-zinc-200 transition-colors duration-200 group-hover/nav:bg-black/30 group-hover/nav:text-white group-focus-within/nav:bg-black/30"
              >
                {dept.name}
                {dept.children.length > 0 && (
                  <ChevronDown className="h-3 w-3 opacity-70" strokeWidth={2.5} />
                )}
              </Link>

              {dept.children.length > 0 && (
                <MegaPanel dept={dept} feat={featured[String(dept.id)]} />
              )}
            </li>
          ))}

          <li className="flex-1" aria-hidden />
          <li>
            <Link
              href="/clearance"
              className="flex h-full items-center gap-1.5 px-3 py-[13px] text-[13px] font-bold text-amber-400 transition-colors duration-200 hover:text-amber-300"
            >
              <Star className="h-3.5 w-3.5 fill-current" />
              Clearance
            </Link>
          </li>
        </ul>
      </div>
    </MegaMenuShell>
  );
}

function MegaPanel({ dept, feat }: { dept: MegaMenuNode; feat?: MegaMenuFeatured }) {
  // 3 link columns: depth-1 children become column groups, balanced across
  // columns; their children are the links (the group itself when childless).
  const groups = dept.children;
  const columns: MegaMenuNode[][] = [[], [], []];
  const weights = [0, 0, 0];
  for (const g of groups) {
    const i = weights.indexOf(Math.min(...weights));
    columns[i].push(g);
    weights[i] += g.children.length + 2;
  }

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

          {/* Featured panel — self-start so it stays a compact card (image + copy)
              instead of stretching to the full mega-menu row height. */}
          <div className="flex flex-col self-start overflow-hidden rounded-lg bg-zinc-50">
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
        </div>
      </div>
    </div>
  );
}
