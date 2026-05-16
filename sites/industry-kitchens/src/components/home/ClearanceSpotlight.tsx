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

export function ClearanceSpotlight({
  products,
  heading = "Clearance Specials",
  eyebrow = "Limited-Time Deals",
}: {
  products: ClearanceProduct[];
  heading?: string;
  eyebrow?: string;
}) {
  if (products.length === 0) return null;

  const maxDiscount = products.reduce<number>((max, p) => {
    const d = discountPct(p.price, p.salePrice);
    return d != null && d > max ? d : max;
  }, 0);

  return (
    <section className="bg-zinc-50 border-y border-zinc-200">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-14">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] mb-2 flex items-center gap-2 text-[#D94B2B]">
              <Tag className="h-3 w-3" />
              {eyebrow}
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-zinc-900">{heading}</h2>
            {maxDiscount > 0 && (
              <p className="mt-2 text-base text-zinc-600">
                Save up to{" "}
                <span className="text-[#D94B2B] font-semibold">{maxDiscount}%</span> on
                commercial kitchen equipment
              </p>
            )}
          </div>
          <Link
            href="/clearance"
            className="inline-flex items-center gap-2 bg-[#D94B2B] text-white px-5 py-3 rounded-md font-bold uppercase tracking-wide text-sm hover:bg-[#C73629] transition-colors w-fit"
          >
            Shop All Clearance
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
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
                className="group relative bg-white border border-zinc-200 rounded-md overflow-hidden hover:shadow-md transition-shadow"
              >
                {discount != null && (
                  <span className="absolute top-3 left-3 z-10 bg-[#D94B2B] text-white text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded">
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
                <div className="p-4 border-t border-zinc-100">
                  <h3 className="text-sm text-zinc-800 group-hover:text-[#D94B2B] transition-colors line-clamp-2 leading-snug min-h-[2.5rem]">
                    {product.name}
                  </h3>
                  <div className="mt-3 flex items-baseline gap-2">
                    {price === 0 ? (
                      <span className="text-sm text-zinc-500">Call for Price</span>
                    ) : salePrice ? (
                      <>
                        <Price amount={salePrice} className="text-base font-bold text-[#D94B2B]" />
                        <span className="text-xs text-zinc-400 line-through">
                          <Price amount={price} />
                        </span>
                      </>
                    ) : (
                      <Price amount={price} className="text-base font-semibold text-zinc-900" />
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
