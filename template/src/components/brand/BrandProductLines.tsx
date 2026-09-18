import Link from "next/link";
import Image from "next/image";
import { Package } from "lucide-react";
import { isAllowedImageUrl } from "@/lib/image-origin";
import type { BrandProductLine } from "@/lib/brand-product-lines";

/**
 * The brand's ranges as picture tiles — Rational's iCombi Pro / iCombi Classic /
 * iVario Cooking Centre / Rational Duo.
 *
 * PER-CHANNEL BY DESIGN, like its sibling `BrandCategories`: it is presentation
 * and the two storefronts do not share a palette. The BEHAVIOUR below is the
 * shared part.
 *
 * The picture is resolved before it gets here (`lib/brand-product-lines.ts`),
 * because production authors a line as a NAME and a category slug and nothing
 * else — every one of the site's product-line tiles drew the grey placeholder
 * until card InEoeMZh gave them the matching category's photograph.
 *
 * `isAllowedImageUrl` is the same "usable" test the category and department
 * strips apply: `/api/image` 403s anything outside our own two buckets and a 403
 * renders as the browser's broken-image glyph, which is the tile Steve was
 * promised we would not ship (gRLRF8yu). A line pointing anywhere else gets the
 * placeholder, not a broken picture.
 */
export type ProductLine = BrandProductLine;

export function BrandProductLines({
  heading,
  lines,
}: {
  heading?: string;
  lines?: ProductLine[];
}) {
  if (!lines || lines.length === 0) return null;
  return (
    <section className="mt-12">
      {heading && <h2 className="text-2xl font-bold text-zinc-900 mb-6">{heading}</h2>}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {lines.map((line) => {
          const href = line.href ?? (line.slug ? `/categories/${line.slug}` : "#");
          const image =
            line.image_url && isAllowedImageUrl(line.image_url) ? line.image_url : null;
          return (
            <Link
              key={line.name + href}
              href={href}
              className="group rounded-xl border border-zinc-200 bg-white p-4 hover:border-zinc-400 hover:shadow-sm transition-all"
            >
              <div className="relative aspect-square bg-zinc-50 rounded-lg overflow-hidden mb-3">
                {image ? (
                  <Image
                    src={image}
                    alt={line.name}
                    fill
                    sizes="(max-width: 640px) 50vw, 25vw"
                    className="object-contain p-3 group-hover:scale-105 transition-transform"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center">
                    <Package className="h-8 w-8 text-zinc-300" strokeWidth={1} />
                  </div>
                )}
              </div>
              <span className="text-sm font-medium text-zinc-900 group-hover:text-amber-700">
                {line.name}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
