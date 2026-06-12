import Link from "next/link";
import Image from "next/image";
import { Menu, ChevronDown, Star } from "lucide-react";
import type { MegaMenuNode, MegaMenuFeatured } from "@/lib/store";

/**
 * Design-system nav bar (Green-700) with CSS-driven mega panels: 3 link
 * columns from the category tree + a featured panel per department (gold top
 * border). Pure server component — open on hover and :focus-within, so it's
 * keyboard operable without JS. Hidden below lg (the MobileNavDrawer takes
 * over).
 */
export function MegaMenu({
  departments,
  featured,
}: {
  departments: MegaMenuNode[];
  featured: Record<string, MegaMenuFeatured>;
}) {
  return (
    <nav aria-label="Departments" className="hidden lg:block bg-brand-deep relative">
      <div className="container-page">
        <ul className="flex items-stretch gap-0.5">
          <li>
            <Link
              href="/categories"
              className="flex h-full items-center gap-2 bg-member px-4 py-[13px] text-[13.5px] font-bold text-ink-900 transition-colors duration-200 hover:bg-member-bright"
            >
              <Menu className="h-4 w-4" strokeWidth={2.2} />
              All Departments
            </Link>
          </li>

          {departments.slice(0, 7).map((dept) => (
            <li key={dept.id} className="group/nav">
              <Link
                href={`/categories/${dept.slug}`}
                className="flex h-full items-center gap-1.5 px-4 py-[13px] text-[13.5px] font-semibold text-[#EAF2EC] transition-colors duration-200 group-hover/nav:bg-black/20 group-hover/nav:text-white group-focus-within/nav:bg-black/20"
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
              className="flex h-full items-center gap-1.5 px-3 py-[13px] text-[13px] font-bold text-member-bright transition-colors duration-200 hover:text-member"
            >
              <Star className="h-3.5 w-3.5 fill-current" />
              Last Units
            </Link>
          </li>
        </ul>
      </div>
    </nav>
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
      className="invisible absolute left-0 right-0 top-full z-[110] translate-y-2 opacity-0 transition-all duration-200
                 group-hover/nav:visible group-hover/nav:translate-y-0 group-hover/nav:opacity-100
                 group-focus-within/nav:visible group-focus-within/nav:translate-y-0 group-focus-within/nav:opacity-100"
    >
      <div className="container-page">
        <div className="grid max-w-[1100px] grid-cols-[1fr_1fr_1fr_240px] gap-6 rounded-b-card border border-border border-t-[3px] border-t-member bg-white p-6 shadow-lg">
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

          {/* Featured panel */}
          <div className="flex flex-col overflow-hidden rounded-card bg-brand-tint">
            <div className="relative grid h-[120px] place-items-center bg-gradient-to-br from-brand-mid to-brand-deep">
              {feat?.image_url && (
                <Image src={feat.image_url} alt="" fill sizes="240px" className="object-cover" />
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
        </div>
      </div>
    </div>
  );
}
