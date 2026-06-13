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
    <MegaMenuShell className="relative hidden bg-zinc-900 lg:block">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <ul className="flex items-stretch gap-0.5">
          <li>
            <Link
              href="/categories"
              className="flex h-full items-center gap-2 bg-teal-600 px-4 py-[13px] text-[13.5px] font-bold text-white transition-colors duration-200 hover:bg-teal-500"
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

  return (
    <div
      className="mega-panel invisible absolute left-0 right-0 top-full z-[110] translate-y-2 opacity-0 transition-all duration-200
                 group-hover/nav:visible group-hover/nav:translate-y-0 group-hover/nav:opacity-100
                 group-focus-within/nav:visible group-focus-within/nav:translate-y-0 group-focus-within/nav:opacity-100"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid max-w-[1100px] grid-cols-[1fr_1fr_1fr_240px] gap-6 rounded-b-lg border border-zinc-200 border-t-[3px] border-t-teal-600 bg-white p-6 shadow-lg">
          {columns.map((col, i) => (
            <div key={i} className="space-y-5">
              {col.map((group) => (
                <div key={group.id}>
                  <Link
                    href={`/categories/${group.slug}`}
                    className="mb-2 block border-b border-zinc-200 pb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-teal-700 hover:text-teal-600"
                  >
                    {group.name}
                  </Link>
                  {group.children.slice(0, 7).map((leaf) => (
                    <Link
                      key={leaf.id}
                      href={`/categories/${leaf.slug}`}
                      className="block py-[5px] text-[13px] text-zinc-700 transition-colors duration-200 hover:text-teal-600"
                    >
                      {leaf.name}
                    </Link>
                  ))}
                  {group.children.length > 7 && (
                    <Link
                      href={`/categories/${group.slug}`}
                      className="block py-[5px] text-[13px] font-semibold text-teal-600 hover:text-teal-700"
                    >
                      View all →
                    </Link>
                  )}
                </div>
              ))}
            </div>
          ))}

          {/* Featured panel */}
          <div className="flex flex-col overflow-hidden rounded-lg bg-zinc-50">
            <div className="relative grid h-[120px] place-items-center bg-gradient-to-br from-zinc-700 to-zinc-900">
              {feat?.image_url && (
                <Image src={feat.image_url} alt="" fill sizes="240px" className="object-cover" />
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
                className="inline-flex items-center rounded-md bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-teal-500"
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
