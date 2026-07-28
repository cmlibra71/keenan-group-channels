"use client";

// ============================================================================
// ProductPageClient — the legacy monolithic product overview (gallery + buy
// column). CMS v2 refactor: state lives in ProductPurchaseProvider (shared
// with the v2 widgets); the JSX below is verbatim pre-refactor markup.
// Public props are unchanged — every existing caller keeps working.
// ============================================================================

import { ProductImageGallery, type ProductImage } from "./ProductImageGallery";
import { ProductDetail } from "./ProductDetail";
import { RichContent } from "@/components/content/RichContent";
import {
  ProductPurchaseProvider,
  useProductPurchase,
  type PurchaseProduct,
} from "./ProductPurchaseProvider";

function ProductOverviewInner({
  brandName,
  reviewSummary,
}: {
  brandName?: string | null;
  reviewSummary?: { avg: number; count: number } | null;
}) {
  const { product, variantImageUrl } = useProductPurchase();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
      {/* Images */}
      <ProductImageGallery
        images={product.images}
        productName={product.name}
        variantImageUrl={variantImageUrl}
      />

      {/* Details — sticky buy box on desktop (design system) */}
      <div className="lg:sticky lg:top-[150px] lg:self-start">
        {brandName && (
          <p className="mb-1 text-[12px] font-bold uppercase tracking-[0.1em] text-accent-dark">{brandName}</p>
        )}
        <h1 className="heading-serif text-[26px] leading-tight text-text-primary sm:text-3xl">{product.name}</h1>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          {product.sku && <p className="spec-mono">SKU: {product.sku}</p>}
          {reviewSummary && reviewSummary.count > 0 && (
            <p className="flex items-center gap-1 text-[13px] text-text-secondary">
              <span className="text-member" aria-hidden>
                {"★".repeat(Math.round(reviewSummary.avg))}
                <span className="text-steel-300">{"★".repeat(5 - Math.round(reviewSummary.avg))}</span>
              </span>
              {reviewSummary.avg.toFixed(1)} · {reviewSummary.count} review{reviewSummary.count === 1 ? "" : "s"}
            </p>
          )}
        </div>

        {product.descriptionShort && (
          <div className="mt-4">
            <RichContent
              html={product.descriptionShort}
              stripStyles
              className="text-sm text-steel-500 prose prose-sm"
            />
          </div>
        )}

        <ProductDetail />
      </div>
    </div>
  );
}

export function ProductPageClient({
  product,
  memberPrice,
  memberPriceMap,
  isMember,
  memberSavingsPct,
  accountPricing,
  membershipTeaser,
  brandName,
  reviewSummary,
}: {
  product: PurchaseProduct;
  memberPrice?: number | null;
  memberPriceMap?: Record<number, number>;
  isMember?: boolean;
  /** Non-members only: what membership saves here, as a whole percentage. */
  memberSavingsPct?: number;
  /** The member price is really a B2B contract price. */
  accountPricing?: boolean;
  membershipTeaser?: { fromPrice: string | null } | null;
  brandName?: string | null;
  reviewSummary?: { avg: number; count: number } | null;
}) {
  return (
    <ProductPurchaseProvider
      product={product}
      memberPrice={memberPrice ?? null}
      memberPriceMap={memberPriceMap ?? {}}
      isMember={isMember ?? false}
      memberSavingsPct={memberSavingsPct ?? 0}
      accountPricing={accountPricing ?? false}
      membershipTeaser={membershipTeaser ?? null}
    >
      <ProductOverviewInner brandName={brandName} reviewSummary={reviewSummary} />
    </ProductPurchaseProvider>
  );
}

export type { ProductImage };
