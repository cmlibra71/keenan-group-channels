import Link from "next/link";
import Image from "next/image";
import { Package } from "lucide-react";
import { isAllowedImageUrl } from "@/lib/image-origin";

/**
 * The categories a brand's products sit in, as tiles (card xOBnQarT: "a brand
 * page lists its categories and products").
 *
 * PER-CHANNEL BY DESIGN. This file is deliberately NOT in
 * `orchestrator/shared-modules.json`, for the same reason its siblings
 * `components/category/CategoryTiles.tsx` and `components/category/FilterRail.tsx`
 * are not: it is presentation, and the two storefronts do not share a palette.
 * Locking it byte-identical would have put Industry Kitchens' grey tiles in the
 * middle of Chefs Depot's green page. The BEHAVIOUR is shared — the props, the
 * `count > 0` filter, the placeholder rule and the overflow disclosure below are
 * the same on both sites — only the classes differ.
 *
 * Deliberately the SAME tile treatment as this site's category strip, down to
 * the placeholder: `isAllowedImageUrl` is the "usable" test /api/image applies,
 * and a 403 there draws the browser's broken-image glyph — the tile Steve was
 * promised we would not ship (gRLRF8yu).
 *
 * `href` is computed by the page, not here, because where a tile GOES depends on
 * the site's rail configuration: with the Category facet on it narrows this
 * brand page, and with it switched off it goes to the category's own page rather
 * than being a control that does nothing.
 *
 * EVERY category is reachable. The strip shows `limit` tiles and puts the rest
 * behind a plain `<details>` disclosure — no JavaScript, no second request —
 * because the rail above deliberately lists only the biggest few (Steve
 * 2026-08-05: "we don't want long lists"), and a brand like Vogue sits on 41
 * Chefs Depot shelves. Capping both would leave most of them unreachable from
 * the brand's own page.
 */
export interface BrandCategoryTile {
  id: number;
  name: string;
  slug: string;
  image_url?: string | null;
  count: number;
  href: string;
}

function Tile({ category }: { category: BrandCategoryTile }) {
  return (
    <Link
      href={category.href}
      className="group flex items-center gap-3 rounded-card border border-border p-3 transition-all hover:border-brand-light hover:shadow-hover"
    >
      {category.image_url && isAllowedImageUrl(category.image_url) ? (
        <div className="relative h-12 w-12 flex-shrink-0">
          <Image
            src={category.image_url}
            alt={category.name}
            fill
            sizes="48px"
            className="rounded object-cover"
          />
        </div>
      ) : (
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded bg-surface-secondary">
          <Package className="h-5 w-5 text-text-muted" />
        </div>
      )}
      <span className="min-w-0 text-sm font-medium text-text-primary group-hover:text-accent">
        <span className="line-clamp-2">{category.name}</span>
        <span className="block text-xs font-normal text-text-muted">
          {category.count} {category.count === 1 ? "product" : "products"}
        </span>
      </span>
    </Link>
  );
}

const GRID = "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";

export function BrandCategories({
  categories,
  heading = "Categories",
  limit = 12,
}: {
  categories: BrandCategoryTile[];
  heading?: string;
  limit?: number;
}) {
  const usable = categories.filter((c) => c.count > 0);
  if (usable.length === 0) return null;
  const shown = usable.slice(0, limit);
  const rest = usable.slice(limit);

  return (
    <div className="mb-10">
      <h2 className="mb-4 text-lg font-semibold text-text-primary">{heading}</h2>
      <div className={GRID}>
        {shown.map((category) => (
          <Tile key={category.id} category={category} />
        ))}
      </div>
      {rest.length > 0 && (
        <details className="mt-3 group/all">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-accent transition-colors duration-300 hover:text-accent-hover">
            <span className="group-open/all:hidden">Show all {usable.length} categories</span>
            <span className="hidden group-open/all:inline">Show fewer categories</span>
          </summary>
          <div className={`${GRID} mt-3`}>
            {rest.map((category) => (
              <Tile key={category.id} category={category} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
