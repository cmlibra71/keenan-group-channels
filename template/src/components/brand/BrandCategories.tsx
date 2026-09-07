import Link from "next/link";
import Image from "next/image";
import { Package } from "lucide-react";
import { isAllowedImageUrl } from "@/lib/image-origin";

/**
 * The categories a brand's products sit in, as tiles (card xOBnQarT: "a brand
 * page lists its categories and products").
 *
 * Deliberately the SAME tile as the category page's Subcategories strip, down
 * to the placeholder: `isAllowedImageUrl` is the "usable" test /api/image
 * applies, and a 403 there draws the browser's broken-image glyph — the tile
 * Steve was promised we would not ship (gRLRF8yu).
 *
 * `hrefFor` is passed in because where a tile GOES depends on the site's rail
 * configuration: with the Category facet on it narrows this brand page, and with
 * it switched off it goes to the category's own page rather than being a control
 * that does nothing.
 */
export interface BrandCategoryTile {
  id: number;
  name: string;
  slug: string;
  image_url?: string | null;
  count: number;
}

export function BrandCategories({
  categories,
  hrefFor,
  heading = "Categories",
  limit = 12,
}: {
  categories: BrandCategoryTile[];
  hrefFor: (category: BrandCategoryTile) => string;
  heading?: string;
  limit?: number;
}) {
  const shown = categories.filter((c) => c.count > 0).slice(0, limit);
  if (shown.length === 0) return null;

  return (
    <div className="mb-10">
      <h2 className="text-lg font-semibold text-zinc-900 mb-4">{heading}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {shown.map((category) => (
          <Link
            key={category.id}
            href={hrefFor(category)}
            className="group flex items-center gap-3 rounded-lg border border-zinc-200 p-3 hover:border-zinc-400 hover:shadow-sm transition-all"
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
              <div className="h-12 w-12 rounded bg-zinc-100 flex items-center justify-center flex-shrink-0">
                <Package className="h-5 w-5 text-zinc-300" />
              </div>
            )}
            <span className="min-w-0 text-sm font-medium text-zinc-700 group-hover:text-zinc-900">
              <span className="line-clamp-2">{category.name}</span>
              <span className="block text-xs font-normal text-zinc-400">
                {category.count} {category.count === 1 ? "product" : "products"}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
