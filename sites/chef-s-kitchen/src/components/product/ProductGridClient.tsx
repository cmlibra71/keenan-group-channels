"use client";
import { ProductCard } from "./ProductCard";
import { Ga4ViewItemList } from "@/components/analytics/Ga4ViewItemList";

// The CLIENT half of ProductGrid: pure grid + cards + GA4 list event, taking
// rows that are ALREADY viewer-scoped and account-priced (the server pass in
// ProductGrid, or a route feeding a Site Builder native). Never call this with
// raw cache rows — visibility/pricing must be applied server-side first.

export interface GridProduct {
  id: number;
  name: string;
  sku?: string | null;
  urlPath: string | null;
  price: string;
  salePrice: string | null;
  brandName?: string | null;
  availability?: string | null;
  inventoryLevel?: number | null;
  inventoryTracking?: string | null;
  thumbnailImage?: { urlStandard: string; urlThumbnail: string | null } | null;
  /**
   * Card tSrCcnvx: the brand's logo, which the tile shows instead of the grey
   * package box when the product has no photo (or its file is broken). Attached
   * UPSTREAM — by `ProductGrid`, or by the node branch that scopes and prices
   * these rows — because this file is presentation only and may never reach the
   * database.
   */
  brand_logo_url?: string | null;
  /** The brand's NAME — the fallback image's ALT text. Attached with the URL above. */
  brand_name?: string | null;
}

export function ProductGridClient({
  products,
  memberPricingAvailable,
  memberPriceMap,
  accountPricing,
  savingsPctMap,
  isMember,
  planPrice,
  eyebrow,
  clearance,
  narrow,
  listId,
  listName,
  wrapperClassName,
  renderEmpty = true,
  indexOffset = 0,
}: {
  products: GridProduct[];
  memberPricingAvailable?: boolean;
  memberPriceMap?: Record<number, number>;
  accountPricing?: boolean;
  savingsPctMap?: Record<number, number>;
  isMember?: boolean;
  planPrice?: string | null;
  eyebrow?: string | null;
  clearance?: boolean;
  narrow?: boolean;
  listId?: string;
  listName?: string;
  /**
   * The grid wrapper's classes. `"contents"` makes this render a CONTINUATION
   * of a grid the caller already owns (the search feed appends chunk after
   * chunk into one grid); omitted, it starts its own.
   */
  wrapperClassName?: string;
  /** False for an appended chunk: "No products found." belongs to the page, once. */
  renderEmpty?: boolean;
  /** Position of the first tile in the whole list, for GA4 list indexes. */
  indexOffset?: number;
}) {
  if (products.length === 0) {
    if (!renderEmpty) return null;
    return (
      <div className="py-16 text-center">
        <p className="text-text-muted">No products found.</p>
      </div>
    );
  }
  return (
    <div
      className={
        wrapperClassName ??
        `grid grid-cols-2 gap-3 sm:gap-4 ${
          narrow ? "md:grid-cols-2 lg:grid-cols-3" : "md:grid-cols-3 lg:grid-cols-4"
        }`
      }
    >
      <Ga4ViewItemList
        listId={listId}
        listName={listName}
        items={products.map((p, index) => ({
          item_id: p.sku ?? String(p.id),
          item_name: p.name,
          item_brand: p.brandName ?? undefined,
          price: parseFloat(p.salePrice ?? p.price) || undefined,
          quantity: 1,
          index: indexOffset + index,
        }))}
      />
      {products.map((product, index) => (
        <ProductCard
          key={product.id}
          id={product.id}
          name={product.name}
          slug={product.urlPath || String(product.id)}
          sku={product.sku}
          price={product.price}
          salePrice={product.salePrice}
          imageUrl={product.thumbnailImage?.urlThumbnail || product.thumbnailImage?.urlStandard}
          brandName={product.brandName}
          brandLogoUrl={product.brand_logo_url ?? null}
          brandLogoAlt={product.brand_name ?? null}
          eyebrow={eyebrow}
          memberPrice={memberPricingAvailable ? memberPriceMap?.[product.id] ?? null : null}
          accountPricing={accountPricing}
          memberSavingsPct={savingsPctMap?.[product.id] ?? 0}
          isMember={isMember}
          planPrice={planPrice}
          clearance={clearance}
          availability={product.availability}
          inventoryLevel={product.inventoryLevel}
          inventoryTracking={product.inventoryTracking}
          listId={listId}
          listName={listName}
          listIndex={indexOffset + index}
        />
      ))}
    </div>
  );
}
