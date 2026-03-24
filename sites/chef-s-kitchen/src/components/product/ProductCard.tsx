import Link from "next/link";
import Image from "next/image";
import { Package } from "lucide-react";
import { Price } from "@/components/ui/Price";

interface ProductCardProps {
  name: string;
  slug: string;
  price: string;
  salePrice?: string | null;
  imageUrl?: string | null;
  brandName?: string;
  memberPricingAvailable?: boolean;
}

export function ProductCard({ name, slug, price, salePrice, imageUrl, brandName, memberPricingAvailable }: ProductCardProps) {
  const displayPrice = parseFloat(price);
  const displaySalePrice = salePrice ? parseFloat(salePrice) : null;

  return (
    <Link href={`/products/${slug}`} className="group block">
      <div className="relative aspect-square overflow-hidden bg-stone-warm">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover group-hover:scale-[1.03] transition-transform duration-700 ease-out"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-ink-faint">
            <Package className="h-10 w-10" strokeWidth={1} />
          </div>
        )}
      </div>
      <div className="mt-4">
        {brandName && (
          <p className="heading-sans text-ink-faint tracking-widest mb-1">{brandName}</p>
        )}
        <h3 className="text-sm font-normal text-navy group-hover:text-teal transition-colors duration-300 line-clamp-2 leading-relaxed">
          {name}
        </h3>
        <div className="mt-2 flex items-center gap-2.5">
          {displayPrice === 0 ? (
            <span className="text-sm text-ink-light">Call for Price</span>
          ) : displaySalePrice ? (
            <>
              <Price amount={displaySalePrice} className="text-sm font-medium text-navy" />
              <span className="text-sm text-ink-faint line-through">
                <Price amount={displayPrice} />
              </span>
            </>
          ) : (
            <Price amount={displayPrice} className="text-sm font-medium text-navy" />
          )}
        </div>
        {memberPricingAvailable && displayPrice > 0 && (
          <span className="mt-2 inline-flex items-center gap-1.5 text-teal text-xs font-medium tracking-wide">
            <span className="h-1 w-1 rounded-full bg-teal" />
            Member pricing available
          </span>
        )}
      </div>
    </Link>
  );
}
