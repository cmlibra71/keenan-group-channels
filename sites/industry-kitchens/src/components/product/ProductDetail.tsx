"use client";

import { useState } from "react";
import { AddToCartButton } from "./AddToCartButton";

type Variant = {
  id: number;
  sku: string | null;
  price: string | null;
  salePrice: string | null;
  optionDisplayName: string | null;
  purchasingDisabled: boolean | null;
  inventoryLevel: number | null;
};

export function ProductDetail({
  productId,
  price,
  salePrice,
  inventoryLevel,
  variants,
}: {
  productId: number;
  price: string;
  salePrice: string | null;
  inventoryLevel: number;
  variants: Variant[];
}) {
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null);

  const selectedVariant = variants.find((v) => v.id === selectedVariantId);

  const displayPrice = selectedVariant?.price
    ? parseFloat(selectedVariant.price)
    : parseFloat(price);
  const displaySalePrice = selectedVariant?.salePrice
    ? parseFloat(selectedVariant.salePrice)
    : selectedVariant
      ? null
      : salePrice
        ? parseFloat(salePrice)
        : null;

  const inStock = selectedVariant
    ? (selectedVariant.inventoryLevel ?? 0) > 0
    : inventoryLevel > 0;

  const purchasingDisabled = selectedVariant?.purchasingDisabled ?? false;

  return (
    <div>
      {/* Price */}
      <div className="mt-4 flex items-center gap-3">
        {displaySalePrice ? (
          <>
            <span className="text-3xl font-bold text-red-600">
              ${displaySalePrice.toFixed(2)}
            </span>
            <span className="text-xl text-zinc-400 line-through">
              ${displayPrice.toFixed(2)}
            </span>
          </>
        ) : (
          <span className="text-3xl font-bold text-zinc-900">
            ${displayPrice.toFixed(2)}
          </span>
        )}
      </div>

      {/* Availability */}
      <div className="mt-4">
        {inStock ? (
          <span className="text-sm text-green-600 font-medium">In Stock</span>
        ) : (
          <span className="text-sm text-red-600 font-medium">Out of Stock</span>
        )}
      </div>

      {/* Variants */}
      {variants.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-zinc-900">Options</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {variants.map((variant) => (
              <button
                key={variant.id}
                onClick={() => setSelectedVariantId(variant.id === selectedVariantId ? null : variant.id)}
                className={`px-4 py-2 rounded-lg border text-sm transition-colors ${
                  variant.id === selectedVariantId
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 hover:border-zinc-400"
                }`}
                disabled={variant.purchasingDisabled ?? false}
              >
                {variant.optionDisplayName || variant.sku || `Variant ${variant.id}`}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Add to Cart */}
      <div className="mt-8">
        <AddToCartButton
          productId={productId}
          variantId={selectedVariantId}
          disabled={!inStock || purchasingDisabled}
        />
      </div>
    </div>
  );
}
