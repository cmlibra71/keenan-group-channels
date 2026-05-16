import Link from "next/link";
import Image from "next/image";
import { Package } from "lucide-react";

export type ProductLine = { name: string; slug?: string; href?: string; image_url?: string };

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
          return (
            <Link
              key={line.name + href}
              href={href}
              className="group rounded-xl border border-zinc-200 bg-white p-4 hover:border-zinc-400 hover:shadow-sm transition-all"
            >
              <div className="relative aspect-square bg-zinc-50 rounded-lg overflow-hidden mb-3">
                {line.image_url ? (
                  <Image
                    src={line.image_url}
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
