import Link from "next/link";
import Image from "next/image";

export type IndustryUse = { name: string; image_url?: string; href?: string };

export function BrandIndustryUses({
  heading,
  items,
}: {
  heading?: string;
  items?: IndustryUse[];
}) {
  if (!items || items.length === 0) return null;
  return (
    <section className="mt-12">
      {heading && <h2 className="text-2xl font-bold text-zinc-900 mb-6">{heading}</h2>}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {items.map((item) => {
          const inner = (
            <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-zinc-100 group">
              {item.image_url && (
                <Image
                  src={item.image_url}
                  alt={item.name}
                  fill
                  sizes="(max-width: 640px) 50vw, 25vw"
                  className="object-cover group-hover:scale-105 transition-transform"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-900/80 to-transparent" />
              <span className="absolute bottom-3 left-4 text-white text-sm font-semibold">
                {item.name}
              </span>
            </div>
          );
          return item.href ? (
            <Link key={item.name} href={item.href}>
              {inner}
            </Link>
          ) : (
            <div key={item.name}>{inner}</div>
          );
        })}
      </div>
    </section>
  );
}
