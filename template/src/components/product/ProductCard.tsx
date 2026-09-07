"use client";

import Link from "next/link";
import Image from "next/image";
import { Package } from "lucide-react";
import { Price } from "@/components/ui/Price";
import { ga4SelectItem } from "@/components/analytics/ga4";
import { PROMO_TAG_LABEL } from "@/lib/promo-tag";

interface ProductCardProps {
  name: string;
  slug: string;
  price: string;
  salePrice?: string | null;
  imageUrl?: string | null;
  brandName?: string;
  memberPricingAvailable?: boolean;
  /** Active member's price for this product — renders the member layout. */
  memberPrice?: number | null;
  /** GA4 select_item context (all optional — card works without analytics). */
  productId?: number;
  listId?: string;
  listName?: string;
  listIndex?: number;
}

export function ProductCard({ name, slug, price, salePrice, imageUrl, brandName, memberPricingAvailable, memberPrice, productId, listId, listName, listIndex }: ProductCardProps) {
  const displayPrice = parseFloat(price);
  const displaySalePrice = salePrice ? parseFloat(salePrice) : null;
  const showMemberPrice =
    memberPrice != null && displayPrice > 0 && memberPrice < (displaySalePrice ?? displayPrice);

  // Non-blocking: gtag queues the event; navigation proceeds immediately.
  function handleSelect() {
    if (productId == null) return;
    ga4SelectItem(
      {
        item_id: String(productId),
        item_name: name,
        item_brand: brandName,
        price: (displaySalePrice ?? displayPrice) || undefined,
        quantity: 1,
        index: listIndex,
      },
      listId,
      listName
    );
  }

  return (
    <Link href={`/products/${slug}`} className="group block" onClick={handleSelect}>
      <div className="relative aspect-square overflow-hidden rounded-lg bg-zinc-100">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover group-hover:scale-105 transition-transform duration-300"
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
        {showMemberPrice ? (
          <div className="mt-1">
            <div className="flex items-center gap-2">
              <Price amount={memberPrice} gst className="text-sm font-semibold text-green-700" />
              <span className="text-sm text-zinc-400 line-through">
                <Price amount={displaySalePrice ?? displayPrice} gst />
              </span>
            </div>
            <span className="mt-0.5 inline-block bg-green-50 text-green-700 px-2 py-0.5 rounded text-xs font-medium">
              Member Price &middot; Save <Price amount={(displaySalePrice ?? displayPrice) - memberPrice} gst />
            </span>
          </div>
        ) : (
          <div className="mt-1 flex items-center gap-2">
            {displayPrice === 0 ? (
              <span className="text-sm font-semibold text-zinc-900">Call for Price</span>
            ) : displaySalePrice ? (
              <>
                <Price amount={displaySalePrice} gst className="text-sm font-semibold text-red-600" />
                <span className="text-sm text-zinc-400 line-through">
                  <Price amount={displayPrice} gst />
                </span>
              </>
            ) : (
              <Price amount={displayPrice} gst className="text-sm font-semibold text-zinc-900" />
            )}
          </div>
        )}
        {!showMemberPrice && memberPricingAvailable && displayPrice > 0 && (
          <span className="mt-1 inline-block bg-green-50 text-green-700 px-2 py-0.5 rounded text-xs font-medium">
            Members save up to 25%
          </span>
        )}

        {/* The site's promotional tile tag — card FNYihLHk. It sits under the brand, name and
            price, which is where the card's mock puts it, and NOT in the image's corner-badge
            stack. On EVERY tile, priced or not: a quote-only line still buys better in quantity.

            A site names its tag in `lib/promo-tag.ts` and that ONE file is the whole opt-in —
            this block renders nothing while the constant is null, and `@/lib/store` places the
            same wording on the authored `product-card` master so the React tile and the tile the
            Site Builder repeats can never say different things.

            `template/` holds null, so nothing renders here today. */}
        {PROMO_TAG_LABEL && (
          <p className="mt-3">
            <span className="badge-promo">{PROMO_TAG_LABEL}</span>
          </p>
        )}
      </div>
    </Link>
  );
}
