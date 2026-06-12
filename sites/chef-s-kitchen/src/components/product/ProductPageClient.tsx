"use client";

import { useState } from "react";
import { ProductImageGallery, type ProductImage } from "./ProductImageGallery";
import { ProductDetail } from "./ProductDetail";
import { RichContent } from "@/components/content/RichContent";

type Variant = {
  id: number;
  sku: string | null;
  price: string | null;
  salePrice: string | null;
  imageUrl: string | null;
  optionDisplayName: string | null;
  purchasingDisabled: boolean | null;
  inventoryLevel: number | null;
};

type Option = {
  id: number;
  displayName: string;
  type: string;
  sortOrder: number | null;
  isRequired: boolean | null;
};

type OptionValue = {
  id: number;
  optionId: number;
  label: string;
  valueData: unknown;
  sortOrder: number | null;
};

type VariantOptionMapping = {
  id: number;
  variantId: number;
  optionId: number;
  optionValueId: number;
};

type BulkPricingRule = {
  id: number;
  quantityMin: number;
  quantityMax: number | null;
  type: string;
  amount: string;
};

export function ProductPageClient({
  product,
  memberPrice,
  memberPriceMap,
  isMember,
  membershipTeaser,
  brandName,
  reviewSummary,
}: {
  product: {
    id: number;
    name: string;
    sku: string | null;
    price: string;
    salePrice: string | null;
    inventoryLevel: number | null;
    inventoryTracking: string | null;
    availability: string | null;
    descriptionShort: string | null;
    images: ProductImage[];
    variants: Variant[];
    options: Option[];
    optionValues: OptionValue[];
    variantOptionMappings: VariantOptionMapping[];
    bulkPricing: BulkPricingRule[];
  };
  memberPrice?: number | null;
  memberPriceMap?: Record<number, number>;
  isMember?: boolean;
  membershipTeaser?: { fromPrice: string | null } | null;
  brandName?: string | null;
  reviewSummary?: { avg: number; count: number } | null;
}) {
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null);

  const selectedVariant = product.variants.find((v) => v.id === selectedVariantId);
  const variantImageUrl = selectedVariant?.imageUrl ?? null;

  // Resolve member price for the currently selected variant
  const activeMemberPrice = selectedVariantId && memberPriceMap?.[selectedVariantId] != null
    ? memberPriceMap[selectedVariantId]
    : memberPrice ?? null;

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
              className="text-sm text-zinc-600 prose prose-sm"
            />
          </div>
        )}

        <ProductDetail
          productId={product.id}
          price={product.price}
          salePrice={product.salePrice}
          inventoryLevel={product.inventoryLevel ?? 0}
          inventoryTracking={product.inventoryTracking ?? "none"}
          availability={product.availability ?? "available"}
          variants={product.variants}
          options={product.options}
          optionValues={product.optionValues}
          variantOptionMappings={product.variantOptionMappings}
          bulkPricing={product.bulkPricing}
          onVariantChange={setSelectedVariantId}
          memberPrice={activeMemberPrice}
          isMember={isMember}
          membershipTeaser={membershipTeaser}
        />
      </div>
    </div>
  );
}
