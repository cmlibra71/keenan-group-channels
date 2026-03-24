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
      <div className="relative aspect-square overflow-hidden bg-surface-secondary">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover group-hover:scale-[1.03] transition-transform duration-700 ease-out"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-text-muted">
            <Package className="h-10 w-10" strokeWidth={1} />
          </div>
        )}
      </div>
      <div className="mt-4">
        {brandName && (
          <p className="heading-sans text-text-muted tracking-widest mb-1">{brandName}</p>
        )}
        <h3 className="text-sm font-normal text-text-primary group-hover:text-accent transition-colors duration-300 line-clamp-2 leading-relaxed">
          {name}
        </h3>
        <div className="mt-2 flex items-center gap-2.5">
          {displayPrice === 0 ? (
            <span className="text-sm text-text-secondary">Call for Price</span>
          ) : displaySalePrice ? (
            <>
              <Price amount={displaySalePrice} className="text-sm font-medium text-text-primary" />
              <span className="text-sm text-text-muted line-through">
                <Price amount={displayPrice} />
              </span>
            </>
          ) : (
            <Price amount={displayPrice} className="text-sm font-medium text-text-primary" />
          )}
        </div>
        {memberPricingAvailable && displayPrice > 0 && (
          <span className="mt-2 badge-member-pricing">
            <span className="h-1 w-1 rounded-full bg-accent" />
            Member pricing available
          </span>
        )}
      </div>
    </Link>
  );
}
