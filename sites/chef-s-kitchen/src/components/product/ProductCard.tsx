"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { Package } from "lucide-react";
import { PriceBlock } from "@/components/ui/PriceBlock";
import { AddToCartButton } from "./AddToCartButton";
import { AddToQuoteButton } from "./AddToQuoteButton";
import { ga4SelectItem } from "@/components/analytics/ga4";

/**
 * Design-system product card: white 1:1 image stage, corner badges (max two),
 * brand mark top-right, category eyebrow → 2-line clamped name → mono SKU →
 * shared PriceBlock → dual Add to Cart / Add to Quote. Hover lifts the card
 * with a green edge. Unpriced (POA) items show no price and a single
 * Add to Quote button.
 */
export interface ProductCardProps {
  id: number;
  name: string;
  slug: string;
  sku?: string | null;
  price: string;
  salePrice?: string | null;
  imageUrl?: string | null;
  brandName?: string | null;
  /**
   * Card tSrCcnvx: the tile falls back to the BRAND's logo when the product has
   * no photo, or when the photo's file turns out to be missing. Null (no brand,
   * or a brand with no usable logo) keeps the grey box with the package icon
   * that shipped before. Attached UPSTREAM by `attachBrandLogos` /
   * `getBrandLogos` — this file is presentation only.
   */
  brandLogoUrl?: string | null;
  /**
   * ALT text for that logo — the brand's NAME, matching what the authored
   * `product-card` master binds, so the same fallback never reads two different
   * ways on two screens. Kept separate from `brandName`, which draws the tile's
   * own brand chip.
   */
  brandLogoAlt?: string | null;
  /** Category eyebrow (usually the page's category name). */
  eyebrow?: string | null;
  memberPrice?: number | null;
  accountPricing?: boolean;
  memberSavingsPct?: number;
  isMember?: boolean;
  planPrice?: string | null;
  /** Render the ink Clearance badge (clearance/last-units contexts). */
  clearance?: boolean;
  availability?: string | null;
  /** Accepted and deliberately unused: the tile does not gate on stock (7vu2iEEZ). Kept so the
   *  grid can keep passing what it reads without every caller changing. */
  inventoryLevel?: number | null;
  /** Accepted and deliberately unused — see `inventoryLevel`. */
  inventoryTracking?: string | null;
  /** GA4 select_item context (all optional — card works without analytics). */
  listId?: string;
  listName?: string;
  listIndex?: number;
}

export function ProductCard({
  id,
  name,
  slug,
  sku,
  price,
  salePrice,
  imageUrl,
  brandName,
  brandLogoUrl,
  brandLogoAlt,
  eyebrow,
  memberPrice,
  accountPricing,
  memberSavingsPct,
  isMember,
  planPrice,
  clearance,
  availability,
  listId,
  listName,
  listIndex,
}: ProductCardProps) {
  // A dead image file is invisible to the server — the row exists and the URL is
  // well formed — so the browser is the only place it can be caught. An errored
  // photo drops to the same fallback an imageless product gets; a logo that is
  // itself missing drops to the grey box rather than a broken-image glyph.
  const [photoBroken, setPhotoBroken] = useState(false);
  const [logoBroken, setLogoBroken] = useState(false);
  const photoUrl = imageUrl && !photoBroken ? imageUrl : null;
  const logoUrl = brandLogoUrl && !logoBroken ? brandLogoUrl : null;

  const rrp = parseFloat(price);
  const sale = salePrice ? parseFloat(salePrice) : null;
  const hasPrice = Number.isFinite(rrp) && rrp > 0;
  const savePct = sale && rrp > 0 ? Math.round(((rrp - sale) / rrp) * 100) : 0;

  // No stock-level badge: per card CXnP1lrL the storefront never states stock
  // status on a tile (the old "Low Stock" tag is gone).
  //
  // NOT BUYABLE means the product is switched off — it does NOT mean the shelf is empty.
  // Stock used to be part of this test (`tracked && level <= 0`), which made the tile the one
  // screen in the shop that refused a sale on stock: the product page has never done it
  // (`@keenan/services/product-page/bridge.tsx`, "HARD RULE: never block an order on stock"),
  // so the same product offered Add to Cart on its own page and hid it on the listing.
  // Tim's ruling on card 7vu2iEEZ (2026-08-11) is that out of stock stays buyable as a back
  // order and Add to Cart RETURNS on listing tiles, identical on all sites. Removing the stock
  // term is that ruling for the tile. It also has to happen here and now, because card
  // KT5lpNRu starts copying Zoey's quantity onto every uncounted product NIGHTLY: with the
  // stock term still in, a product selling out in Zoey would silently lose its Add to Cart the
  // next morning, and card CXnP1lrL removed the only wording that would have explained it.
  // (IK and the template card carry no stock gate at all, so this is Chefs Depot only.)
  const outOfStock = availability === "disabled";

  // Non-blocking: gtag queues the event; navigation proceeds immediately.
  function handleSelect() {
    ga4SelectItem(
      {
        item_id: sku ?? String(id),
        item_name: name,
        item_brand: brandName ?? undefined,
        price: (sale ?? rrp) || undefined,
        quantity: 1,
        index: listIndex,
      },
      listId,
      listName
    );
  }

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-card border border-border bg-white shadow-sm transition-all duration-200 hover:-translate-y-[3px] hover:border-brand-light hover:shadow-hover">
      {/* Image stage — uniform white 1:1 */}
      <Link href={`/products/${slug}`} className="relative block aspect-square bg-white" onClick={handleSelect}>
        {photoUrl ? (
          <Image
            src={photoUrl}
            alt={name}
            onError={() => setPhotoBroken(true)}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-contain p-3 transition-transform duration-500 ease-out group-hover:scale-[1.04]"
          />
        ) : logoUrl ? (
          /* Card tSrCcnvx: the brand's logo stands in for the missing photo.
             Contained with more padding than a photo gets — brand logos are
             normalised to 600x300, so a 2:1 image in a square stage needs room
             to stay readable — and never `object-cover`, which would crop it. */
          <Image
            src={logoUrl}
            alt={brandLogoAlt || brandName || name}
            onError={() => setLogoBroken(true)}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-contain p-6"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-steel-300">
            <Package className="h-10 w-10" strokeWidth={1} />
          </div>
        )}

        {/* Corner badges — top-left, max two */}
        <div className="absolute left-2.5 top-2.5 z-[2] flex flex-col items-start gap-1.5">
          {savePct >= 5 && <span className="badge-save">Save {savePct}%</span>}
          {clearance && <span className="badge-clearance">Clearance</span>}
        </div>

        {/* Brand mark — top-right */}
        {brandName && (
          <span className="absolute right-2.5 top-2.5 z-[2] rounded-sm bg-steel-50 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.06em] text-steel-500">
            {brandName}
          </span>
        )}
      </Link>

      {/* Body */}
      <div className="flex flex-1 flex-col p-4">
        {eyebrow && (
          <p className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.1em] text-steel-400">{eyebrow}</p>
        )}
        <Link href={`/products/${slug}`} className="block" onClick={handleSelect}>
          <h3 className="line-clamp-2 min-h-[2.5rem] text-[13.5px] font-medium leading-snug text-ink-800 transition-colors duration-200 group-hover:text-accent">
            {name}
          </h3>
        </Link>
        {sku && <p className="spec-mono mt-1 text-steel-400">SKU: {sku}</p>}

        {/* Pricing — shared trade model */}
        <div className="mt-auto pt-2.5">
          {hasPrice && (
            <PriceBlock
              rrp={rrp}
              memberPrice={memberPrice}
              accountPricing={accountPricing}
              memberSavingsPct={memberSavingsPct}
              isMember={isMember}
              planPrice={planPrice}
              size="card"
            />
          )}
        </div>

        {/* CTAs */}
        <div className="mt-3 flex flex-col gap-2">
          {hasPrice && !outOfStock ? (
            <>
              <AddToCartButton
                productId={id}
                size="sm"
                productName={name}
                sku={sku}
                price={sale ?? rrp}
                brandName={brandName ?? undefined}
                categoryName={eyebrow ?? undefined}
              />
              <AddToQuoteButton productId={id} size="sm" />
            </>
          ) : (
            <AddToQuoteButton productId={id} size="sm" />
          )}
        </div>
      </div>
    </div>
  );
}
