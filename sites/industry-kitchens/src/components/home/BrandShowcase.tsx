import Link from "next/link";
import Image from "next/image";
import { ChevronRight, Award } from "lucide-react";

type Brand = {
  id: number;
  name: string;
  slug: string;
  image_url?: string | null;
};

export function BrandShowcase({ brands }: { brands: Brand[] }) {
  if (brands.length === 0) return null;

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
      <div className="flex items-end justify-between mb-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500 mb-3 flex items-center gap-2">
            <Award className="h-3 w-3" />
            Premium Partners
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold text-zinc-900">Shop by Brand</h2>
        </div>
        <Link href="/brands" className="hidden sm:inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 hover:text-zinc-900 transition-colors">
          All Brands
          <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-9 gap-px bg-zinc-200 border border-zinc-200 rounded-lg overflow-hidden">
        {brands.slice(0, 9).map((brand) => (
          <Link
            key={brand.id}
            href={`/brands/${brand.slug}`}
            className="group relative aspect-square bg-white flex items-center justify-center p-4 sm:p-6 hover:bg-zinc-50 transition-colors duration-300"
          >
            {brand.image_url ? (
              <Image
                src={brand.image_url}
                alt={brand.name}
                fill
                sizes="(max-width: 640px) 33vw, (max-width: 1024px) 33vw, 11vw"
                className="object-contain p-4 sm:p-6 grayscale group-hover:grayscale-0 group-hover:scale-105 transition-all duration-500 ease-out"
              />
            ) : (
              <span className="text-center text-zinc-900 text-sm sm:text-base font-semibold group-hover:text-amber-600 transition-colors duration-300">
                {brand.name}
              </span>
            )}
          </Link>
        ))}
      </div>

      <Link
        href="/brands"
        className="sm:hidden mt-6 flex items-center justify-center gap-1.5 text-sm font-medium text-zinc-600 hover:text-zinc-900 transition-colors"
      >
        All Brands
        <ChevronRight className="h-3 w-3" />
      </Link>
    </section>
  );
}
