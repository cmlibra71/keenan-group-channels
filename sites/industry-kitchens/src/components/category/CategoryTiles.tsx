import Link from "next/link";
import Image from "next/image";
import { Package, ChevronRight } from "lucide-react";
import { isAllowedImageUrl } from "@/lib/image-origin";

/**
 * "Shop by Category" — the way INTO the category tree from a flat product
 * listing. One image tile per department, linking to its category page.
 *
 * The rows handed in are the DEPARTMENT BAR's own resolved list (see
 * `products/page.tsx`), so this strip and the menu above it cannot disagree.
 *
 * A department with no usable image gets the grey placeholder box with the
 * package icon — the same placeholder the product card and `/categories`
 * already use (card gRLRF8yu, Steve 2026-08-10: the grey box stays) — never a
 * broken tile. "Usable" is checked against the image proxy's own allowlist:
 * `/api/image` 403s anything outside our S3 buckets, and a 403 renders as the
 * browser's broken-image glyph, which is exactly the tile this card was asked
 * not to ship.
 */
export type CategoryTile = {
  id: number;
  name: string;
  slug: string;
  image_url?: string | null;
};

export function CategoryTiles({
  categories,
  heading = "Shop by Category",
}: {
  categories: CategoryTile[];
  heading?: string;
}) {
  if (categories.length === 0) return null;

  return (
    <section aria-labelledby="shop-by-category" className="mb-10">
      <div className="mb-4 flex items-end justify-between gap-4">
        <h2 id="shop-by-category" className="text-lg font-semibold text-zinc-900">
          {heading}
        </h2>
        <Link
          href="/categories"
          className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900"
        >
          View all
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {categories.map((category) => (
          <Link
            key={category.id}
            href={`/categories/${category.slug}`}
            className="group overflow-hidden rounded-lg border border-zinc-200 bg-white transition-all hover:border-zinc-400 hover:shadow-sm"
          >
            <div className="relative aspect-[4/3] overflow-hidden bg-zinc-100">
              {category.image_url && isAllowedImageUrl(category.image_url) ? (
                <Image
                  src={category.image_url}
                  alt={category.name}
                  fill
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 17vw"
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-zinc-300">
                  <Package className="h-8 w-8" />
                </div>
              )}
            </div>
            <p className="px-3 py-2.5 text-sm font-semibold leading-snug text-zinc-900">
              {category.name}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
