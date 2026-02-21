import Link from "next/link";
import { Package } from "lucide-react";

interface ProductCardProps {
  name: string;
  slug: string;
  price: string;
  salePrice?: string | null;
  imageUrl?: string | null;
  brandName?: string;
}

export function ProductCard({ name, slug, price, salePrice, imageUrl, brandName }: ProductCardProps) {
  const displayPrice = parseFloat(price);
  const displaySalePrice = salePrice ? parseFloat(salePrice) : null;

  return (
    <Link href={`/products/${slug}`} className="group block">
      <div className="aspect-square overflow-hidden rounded-lg bg-zinc-100">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-zinc-300">
            <Package className="h-12 w-12" />
          </div>
        )}
      </div>
      <div className="mt-3">
        {brandName && (
          <p className="text-xs text-zinc-500 uppercase tracking-wide">{brandName}</p>
        )}
        <h3 className="text-sm font-medium text-zinc-900 group-hover:text-zinc-600 line-clamp-2">
          {name}
        </h3>
        <div className="mt-1 flex items-center gap-2">
          {displaySalePrice ? (
            <>
              <span className="text-sm font-semibold text-red-600">
                ${displaySalePrice.toFixed(2)}
              </span>
              <span className="text-sm text-zinc-400 line-through">
                ${displayPrice.toFixed(2)}
              </span>
            </>
          ) : (
            <span className="text-sm font-semibold text-zinc-900">
              ${displayPrice.toFixed(2)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
