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

      {/* Details */}
      <div>
        <h1 className="text-3xl font-bold text-zinc-900">{product.name}</h1>

        {product.sku && (
          <p className="mt-1 text-sm text-zinc-500">SKU: {product.sku}</p>
        )}

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
        />
      </div>
    </div>
  );
}
