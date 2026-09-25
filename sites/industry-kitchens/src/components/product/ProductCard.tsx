"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
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
  /**
   * Card tSrCcnvx (Tim, 2026-08-19): the tile falls back to the BRAND's logo
   * when the product has no photo, or when the photo's file turns out to be
   * missing. Null (no brand, or a brand with no usable logo) keeps the grey box
   * with the package icon that shipped before.
   */
  brandLogoUrl?: string | null;
  /**
   * ALT text for that logo — the brand's NAME, matching what the authored
   * `product-card` master binds, so the same fallback never reads two different
   * ways on two screens. Kept separate from `brandName`, which draws the tile's
   * brand eyebrow: these listings do not show one and this must not start.
   */
  brandLogoAlt?: string | null;
  memberPricingAvailable?: boolean;
  /** Active member's price for this product — renders the member layout. */
  memberPrice?: number | null;
  /**
   * Card tJ4audbu — the PARTNER SPECIAL on this product. `price` / `salePrice` already carry its
   * was/now, which the sale branch below draws; this puts Tim's badge over the picture.
   */
  special?: { badge: string; label: string | null } | null;
  /** GA4 select_item context (all optional — card works without analytics). */
  productId?: number;
  listId?: string;
  listName?: string;
  listIndex?: number;
  /** The Buy X Get Y / free-freight badge this product carries (card EIXdjw2s); null = none. */
  promotionBadge?: string | null;
}

export function ProductCard({ name, slug, price, salePrice, imageUrl, brandName, brandLogoUrl, brandLogoAlt, memberPricingAvailable, memberPrice, special, productId, listId, listName, listIndex, promotionBadge }: ProductCardProps) {
  // A dead image file is invisible to the server — the row exists and the URL is
  // well formed — so the browser is the only place it can be caught. An errored
  // photo drops to the same fallback an imageless product gets; a logo that is
  // itself missing drops to the grey box rather than a broken-image glyph.
  const [photoBroken, setPhotoBroken] = useState(false);
  const [logoBroken, setLogoBroken] = useState(false);
  const photoUrl = imageUrl && !photoBroken ? imageUrl : null;
  const logoUrl = brandLogoUrl && !logoBroken ? brandLogoUrl : null;

  const displayPrice = parseFloat(price);
  const displaySalePrice = salePrice ? parseFloat(salePrice) : null;
  // Never a member layout on a special: members pay the special too (Tim: "Special Price will
  // be the floor"), and the upstream member map leaves special products out already.
  const showMemberPrice =
    !special && memberPrice != null && displayPrice > 0 && memberPrice < (displaySalePrice ?? displayPrice);

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
    <Link
      href={`/products/${slug}`}
      className="group block"
      onClick={handleSelect}
      // Read by SearchClickLogger to stamp `clicked_product_id` on the search that produced
      // this tile (card LjdIfc92). On the LINK, never on the card, so Add to Cart is not a
      // click-through. Inert everywhere else.
      data-product-id={productId}
    >
      <div className="relative aspect-square overflow-hidden rounded-lg bg-zinc-100">
        {photoUrl ? (
          <Image
            src={photoUrl}
            alt={name}
            onError={() => setPhotoBroken(true)}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : logoUrl ? (
          /* Contained and padded, never `object-cover`: brand logos are 600x300,
             and cropping one to fill a square stage makes it unreadable. */
          <Image
            src={logoUrl}
            alt={brandLogoAlt || brandName || name}
            onError={() => setLogoBroken(true)}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-contain p-6"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-zinc-300">
            <Package className="h-12 w-12" />
          </div>
        )}
        {/* Card tJ4audbu — Tim's "Partner Special - No further discounts" image overlay. The
            class is this site's own (globals.css), shared with the badge `@/lib/store` places on
            the authored tile, so the two tiles cannot look different. */}
        {special && <span className="special-badge">{special.badge}</span>}
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

        {/* The site's promotional tile tag — card FNYihLHk. Under the brand, name and price,
            where the card's mock puts it, and not in the image's corner-badge stack.

            THIS SITE RENDERS NOTHING HERE TODAY: `lib/promo-tag.ts` holds null on Industry
            Kitchens, on purpose. "Buy more & save" is the shopper-facing face of the CHEFS DEPOT
            buying-group ladder (cards Nyp8bkPm / gk23c1VK); Industry Kitchens has its own trade
            wording ("Mates Rates") on a different pricing model.

            The block is present so that naming a tag in that one file is the whole opt-in — the
            same wording is placed on the authored `product-card` master by `@/lib/store`, so
            this tile and the tile the Site Builder repeats can never say different things. */}
        {/* The Buy X Get Y / free-freight badge (card EIXdjw2s): per product, only for a public
            offer this storefront is running — the same wording the authored tile draws. */}
        {promotionBadge && !special && (
          <p className="mt-2">
            <span className="badge-offer">{promotionBadge}</span>
          </p>
        )}
        {/* Not on a Partner Special: "Buy more & save" beside "No further discounts" contradicts
            it (card tJ4audbu). The authored tile follows the same rule. */}
        {PROMO_TAG_LABEL && !special && (
          <p className="mt-3">
            <span className="badge-promo">{PROMO_TAG_LABEL}</span>
          </p>
        )}
      </div>
    </Link>
  );
}
