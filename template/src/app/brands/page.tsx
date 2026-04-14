import Link from "next/link";
import Image from "next/image";
import { Package } from "lucide-react";
import { getBrandsForChannel } from "@/lib/store";

export const metadata = {
  title: "Brands",
};

export default async function BrandsPage() {
  const brands = await getBrandsForChannel();

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-zinc-900 mb-8">Brands</h1>

      {brands.length === 0 ? (
        <p className="text-zinc-500">No brands found.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {brands.map((brand: { id: number; name: string; slug: string; image_url?: string | null }) => (
            <Link
              key={brand.id}
              href={`/brands/${brand.slug}`}
              className="group block rounded-lg border border-zinc-200 overflow-hidden hover:border-zinc-400 hover:shadow-sm transition-all"
            >
              <div className="relative aspect-[4/3] bg-zinc-100 overflow-hidden">
                {brand.image_url ? (
                  <Image
                    src={brand.image_url}
                    alt={brand.name}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    className="object-contain p-4 group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-zinc-300">
                    <Package className="h-12 w-12" />
                  </div>
                )}
              </div>
              <div className="p-4">
                <h2 className="text-lg font-semibold text-zinc-900">{brand.name}</h2>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
