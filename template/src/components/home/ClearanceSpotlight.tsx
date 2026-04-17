import Link from "next/link";
import Image from "next/image";
import { Tag, ChevronRight, Package } from "lucide-react";
import { Price } from "@/components/ui/Price";

type ClearanceProduct = {
  id: number;
  name: string;
  urlPath: string | null;
  price: string;
  salePrice: string | null;
  thumbnailImage?: { urlStandard: string; urlThumbnail: string | null } | null;
};

function discountPct(price: string, salePrice: string | null | undefined): number | null {
  const p = parseFloat(price);
  const sp = salePrice ? parseFloat(salePrice) : null;
  if (!sp || !p || sp >= p) return null;
  return Math.round(((p - sp) / p) * 100);
}

export function ClearanceSpotlight({ products }: { products: ClearanceProduct[] }) {
  if (products.length === 0) return null;

  const maxDiscount = products.reduce<number>((max, p) => {
    const d = discountPct(p.price, p.salePrice);
    return d != null && d > max ? d : max;
  }, 0);

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-stone-900 via-zinc-900 to-stone-900 text-white">
      {/* Diagonal accent stripes */}
      <div className="absolute -top-8 -right-8 w-64 h-64 bg-amber-500/15 rotate-12 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-8 -left-8 w-64 h-64 bg-amber-500/10 rotate-12 blur-3xl pointer-events-none" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] mb-3 flex items-center gap-2 text-amber-400">
              <Tag className="h-3 w-3" />
              Limited-Time Deals
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-white">Clearance Specials</h2>
            {maxDiscount > 0 && (
              <p className="mt-3 text-lg text-slate-300">
                Save up to <span className="text-amber-400 font-semibold">{maxDiscount}%</span> on commercial kitchen equipment
              </p>
            )}
          </div>
          <Link
            href="/clearance"
            className="inline-flex items-center gap-2 bg-amber-500 text-zinc-900 px-5 py-3 rounded-[14px] font-semibold text-sm hover:bg-amber-400 transition-colors shadow-sm w-fit"
          >
            Shop All Clearance
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-3 sm:gap-4">
          {products.slice(0, 9).map((product) => {
            const href = `/products/${product.urlPath ?? product.id}`;
            const discount = discountPct(product.price, product.salePrice);
            const price = parseFloat(product.price);
            const salePrice = product.salePrice ? parseFloat(product.salePrice) : null;
            const imageUrl = product.thumbnailImage?.urlThumbnail || product.thumbnailImage?.urlStandard;

            return (
              <Link
                key={product.id}
                href={href}
                className="group relative bg-white/5 border border-white/10 rounded-xl overflow-hidden hover:border-amber-400/40 hover:bg-white/10 transition-colors"
              >
                {discount != null && (
                  <span className="absolute top-3 left-3 z-10 bg-amber-500 text-zinc-900 text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded">
                    Save {discount}%
                  </span>
                )}
                <div className="relative aspect-square bg-white">
                  {imageUrl ? (
                    <Image
                      src={imageUrl}
                      alt={product.name}
                      fill
                      sizes="(max-width: 640px) 50vw, 33vw"
                      className="object-contain p-4 group-hover:scale-[1.03] transition-transform duration-500 ease-out"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-zinc-300">
                      <Package className="h-10 w-10" strokeWidth={1} />
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="text-sm text-white group-hover:text-amber-400 transition-colors line-clamp-2 leading-snug min-h-[2.5rem]">
                    {product.name}
                  </h3>
                  <div className="mt-3 flex items-baseline gap-2">
                    {price === 0 ? (
                      <span className="text-sm text-slate-400">Call for Price</span>
                    ) : salePrice ? (
                      <>
                        <Price amount={salePrice} className="text-base font-semibold text-amber-400" />
                        <span className="text-xs text-slate-500 line-through">
                          <Price amount={price} />
                        </span>
                      </>
                    ) : (
                      <Price amount={price} className="text-base font-semibold text-white" />
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
