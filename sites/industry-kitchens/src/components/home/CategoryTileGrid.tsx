"use client";
// Pure presentational — it only ever imported a TYPE from the store, so the
// boundary move changes what ships to the browser, not what is drawn. Needed so
// the Site Builder natives can render the same component the live page does,
// rather than a second copy that would drift.

import Link from "next/link";
import Image from "next/image";
import type { CategoryTile } from "@/lib/store";

// Photographic category tile grid matching the industrykitchens.com.au homepage.
// `span: 2` tiles render full-width (mobile) / half-width (desktop) as wide
// banners; `span: 1` tiles are quarter-width cards. Image heights stay equal
// across a row because a 2-wide tile uses an 8:3 image vs 4:3 for a 1-wide.
export function CategoryTileGrid({
  tiles,
  heading,
}: {
  tiles: CategoryTile[];
  heading?: string;
}) {
  if (!tiles || tiles.length === 0) return null;

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-9">
      {heading && (
        <h2 className="text-xl sm:text-2xl font-bold text-zinc-900 mb-5 text-center">
          {heading}
        </h2>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {tiles.map((tile) => {
          const wide = tile.span === 2;
          return (
            <Link
              key={tile.href + tile.label}
              href={tile.href}
              className={`group flex flex-col overflow-hidden rounded-md border border-zinc-200 bg-white shadow-sm hover:shadow-md transition-shadow ${
                wide ? "col-span-2" : ""
              }`}
            >
              <div
                className={`relative bg-zinc-100 ${wide ? "aspect-[8/3]" : "aspect-[4/3]"}`}
              >
                {tile.image_url && (
                  <Image
                    src={tile.image_url}
                    alt={tile.label}
                    fill
                    sizes={wide ? "(max-width: 768px) 100vw, 50vw" : "(max-width: 768px) 50vw, 25vw"}
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                )}
              </div>
              <div className="flex flex-1 items-center justify-center border-t border-zinc-200 bg-zinc-50 px-3 py-3 min-h-[3.25rem]">
                <span className="text-center text-sm sm:text-base font-semibold leading-tight text-zinc-800 transition-colors group-hover:text-[#D94B2B]">
                  {tile.label}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
