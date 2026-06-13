import Link from "next/link";
import Image from "next/image";
import { Package } from "lucide-react";
import { PriceBlock } from "@/components/ui/PriceBlock";
import { AddToCartButton } from "./AddToCartButton";
import { AddToQuoteButton } from "./AddToQuoteButton";

/**
 * Design-system product card: white 1:1 image stage, corner badges (max two),
 * brand mark top-right, category eyebrow → 2-line clamped name → mono SKU →
 * shared PriceBlock → dual Add to Cart / Add to Quote. Hover lifts the card
 * with a green edge. "Enquire" replaces Add to Cart for unpriced (POA) items.
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
  /** Category eyebrow (usually the page's category name). */
  eyebrow?: string | null;
  memberPrice?: number | null;
  isMember?: boolean;
  planPrice?: string | null;
  /** Render the ink Clearance badge (clearance/last-units contexts). */
  clearance?: boolean;
  availability?: string | null;
  inventoryLevel?: number | null;
  inventoryTracking?: string | null;
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
  eyebrow,
  memberPrice,
  isMember,
  planPrice,
  clearance,
  availability,
  inventoryLevel,
  inventoryTracking,
}: ProductCardProps) {
  const rrp = parseFloat(price);
  const sale = salePrice ? parseFloat(salePrice) : null;
  const hasPrice = Number.isFinite(rrp) && rrp > 0;
  const savePct = sale && rrp > 0 ? Math.round(((rrp - sale) / rrp) * 100) : 0;

  const tracked = (inventoryTracking ?? "none") !== "none";
  const lowStock = tracked && (inventoryLevel ?? 0) > 0 && (inventoryLevel ?? 0) <= 3;
  const outOfStock = availability === "disabled" || (tracked && (inventoryLevel ?? 0) <= 0);

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-card border border-border bg-white shadow-sm transition-all duration-200 hover:-translate-y-[3px] hover:border-brand-light hover:shadow-hover">
      {/* Image stage — uniform white 1:1 */}
      <Link href={`/products/${slug}`} className="relative block aspect-square bg-white">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-contain p-3 transition-transform duration-500 ease-out group-hover:scale-[1.04]"
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
          {!savePct && !clearance && lowStock && <span className="badge-stock-low">Low Stock</span>}
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
        <Link href={`/products/${slug}`} className="block">
          <h3 className="line-clamp-2 min-h-[2.5rem] text-[13.5px] font-medium leading-snug text-ink-800 transition-colors duration-200 group-hover:text-accent">
            {name}
          </h3>
        </Link>
        {sku && <p className="spec-mono mt-1 text-steel-400">SKU: {sku}</p>}

        {/* Pricing — shared trade model */}
        <div className="mt-auto pt-2.5">
          {hasPrice ? (
            <PriceBlock
              rrp={rrp}
              memberPrice={memberPrice}
              isMember={isMember}
              planPrice={planPrice}
              size="card"
            />
          ) : (
            <p className="text-sm font-semibold text-text-secondary">Call for Price</p>
          )}
        </div>

        {/* CTAs */}
        <div className="mt-3 flex flex-col gap-2">
          {hasPrice && !outOfStock ? (
            <>
              <AddToCartButton productId={id} size="sm" />
              <AddToQuoteButton productId={id} size="sm" />
            </>
          ) : outOfStock ? (
            <>
              <button disabled className="btn-primary btn-sm w-full">Out of stock</button>
              <AddToQuoteButton productId={id} size="sm" />
            </>
          ) : (
            <AddToQuoteButton productId={id} size="sm" label="Enquire" />
          )}
        </div>
      </div>
    </div>
  );
}
