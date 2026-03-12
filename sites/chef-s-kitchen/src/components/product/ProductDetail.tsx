"use client";

import { useState, useMemo } from "react";
import { AddToCartButton } from "./AddToCartButton";
import { AddToQuoteButton } from "./AddToQuoteButton";
import { OptionSelector } from "./OptionSelector";
import { Price } from "@/components/ui/Price";

type Variant = {
  id: number;
  sku: string | null;
  price: string | null;
  salePrice: string | null;
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

export function ProductDetail({
  productId,
  price,
  salePrice,
  inventoryLevel,
  inventoryTracking,
  availability,
  variants,
  options = [],
  optionValues = [],
  variantOptionMappings = [],
  bulkPricing = [],
}: {
  productId: number;
  price: string;
  salePrice: string | null;
  inventoryLevel: number;
  inventoryTracking: string;
  availability: string;
  variants: Variant[];
  options?: Option[];
  optionValues?: OptionValue[];
  variantOptionMappings?: VariantOptionMapping[];
  bulkPricing?: BulkPricingRule[];
}) {
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<Record<number, number>>({});

  const useGroupedMode = options.length > 0 && variantOptionMappings.length > 0;

  // Build variant lookup: sorted "optionId:valueId,..." → variant
  const variantLookup = useMemo(() => {
    if (!useGroupedMode) return new Map<string, Variant>();
    const map = new Map<string, Variant>();
    // Group mappings by variantId
    const byVariant = new Map<number, VariantOptionMapping[]>();
    for (const m of variantOptionMappings) {
      const arr = byVariant.get(m.variantId) || [];
      arr.push(m);
      byVariant.set(m.variantId, arr);
    }
    for (const [variantId, mappings] of byVariant) {
      const key = mappings
        .map((m) => `${m.optionId}:${m.optionValueId}`)
        .sort()
        .join(",");
      const variant = variants.find((v) => v.id === variantId);
      if (variant) map.set(key, variant);
    }
    return map;
  }, [useGroupedMode, variantOptionMappings, variants]);

  // Get matched variant from current selections
  const matchedVariant = useMemo(() => {
    if (!useGroupedMode) return null;
    if (Object.keys(selectedOptions).length !== options.length) return null;
    const key = Object.entries(selectedOptions)
      .map(([optId, valId]) => `${optId}:${valId}`)
      .sort()
      .join(",");
    return variantLookup.get(key) ?? null;
  }, [useGroupedMode, selectedOptions, options.length, variantLookup]);

  // Compute which values are available per option
  const disabledValuesPerOption = useMemo(() => {
    if (!useGroupedMode) return new Map<number, Set<number>>();
    const result = new Map<number, Set<number>>();

    for (const option of options) {
      const disabled = new Set<number>();
      const valuesForOption = optionValues.filter((v) => v.optionId === option.id);
      // For each value of this option, check if any variant exists
      // that matches the current selections for OTHER options + this value
      const otherSelections = { ...selectedOptions };
      delete otherSelections[option.id];

      for (const val of valuesForOption) {
        const testSelections = { ...otherSelections, [option.id]: val.id };
        // Check if any variant matches this combination (partial match ok)
        const hasMatch = [...variantLookup.entries()].some(([key]) => {
          return Object.entries(testSelections).every(([optId, valId]) =>
            key.includes(`${optId}:${valId}`)
          );
        });
        if (!hasMatch) disabled.add(val.id);
      }
      result.set(option.id, disabled);
    }
    return result;
  }, [useGroupedMode, options, optionValues, selectedOptions, variantLookup]);

  const handleOptionSelect = (optionId: number, valueId: number) => {
    setSelectedOptions((prev) => ({ ...prev, [optionId]: valueId }));
  };

  // Determine active variant for display
  const activeVariant = useGroupedMode ? matchedVariant : variants.find((v) => v.id === selectedVariantId);

  const displayPrice = activeVariant?.price
    ? parseFloat(activeVariant.price)
    : parseFloat(price);
  const displaySalePrice = activeVariant?.salePrice
    ? parseFloat(activeVariant.salePrice)
    : activeVariant
      ? null
      : salePrice
        ? parseFloat(salePrice)
        : null;

  const inStock = (() => {
    if (availability === "disabled") return false;
    if (inventoryTracking === "none") return true;
    if (activeVariant) {
      return (activeVariant.inventoryLevel ?? 0) > 0;
    }
    return inventoryLevel > 0;
  })();

  const purchasingDisabled = activeVariant?.purchasingDisabled ?? false;

  // In grouped mode, require all options selected before enabling cart
  const allOptionsSelected = useGroupedMode
    ? Object.keys(selectedOptions).length === options.length && matchedVariant !== null
    : true;

  return (
    <div>
      {/* Price */}
      <div className="mt-4 flex items-center gap-3">
        {displayPrice === 0 ? (
          <span className="text-2xl font-bold text-zinc-900">Call for Price</span>
        ) : displaySalePrice ? (
          <>
            <Price amount={displaySalePrice} className="text-3xl font-bold text-red-600" />
            <span className="text-xl text-zinc-400 line-through">
              <Price amount={displayPrice} />
            </span>
          </>
        ) : (
          <Price amount={displayPrice} className="text-3xl font-bold text-zinc-900" />
        )}
      </div>

      {/* Bulk Pricing Tiers */}
      {bulkPricing.length > 0 && displayPrice > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-zinc-700 mb-2">Bulk Pricing</h3>
          <div className="rounded-lg border border-zinc-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-50 text-zinc-600">
                  <th className="px-3 py-2 text-left font-medium">Quantity</th>
                  <th className="px-3 py-2 text-right font-medium">Price Per Unit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {bulkPricing.map((rule) => {
                  const tierPrice = rule.type === "fixed" ? parseFloat(rule.amount)
                    : rule.type === "percent" ? displayPrice * (1 - parseFloat(rule.amount) / 100)
                    : displayPrice - parseFloat(rule.amount);
                  return (
                    <tr key={rule.id} className="text-zinc-700">
                      <td className="px-3 py-2">
                        {rule.quantityMax
                          ? `${rule.quantityMin} – ${rule.quantityMax}`
                          : `${rule.quantityMin}+`}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Price amount={tierPrice} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Grouped Option Selectors */}
      {useGroupedMode && (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-5">
          <h3 className="text-sm font-semibold text-zinc-900 mb-4">Configure</h3>
          <div className="space-y-5">
            {options.map((option) => (
              <OptionSelector
                key={option.id}
                option={option}
                values={optionValues.filter((v) => v.optionId === option.id)}
                selectedValueId={selectedOptions[option.id] ?? null}
                disabledValueIds={disabledValuesPerOption.get(option.id) ?? new Set()}
                onSelect={handleOptionSelect}
              />
            ))}
          </div>
        </div>
      )}

      {/* Add to Cart / Quote */}
      <div className="mt-8 space-y-3">
        <AddToCartButton
          productId={productId}
          variantId={useGroupedMode ? (matchedVariant?.id ?? null) : selectedVariantId}
          disabled={!inStock || purchasingDisabled || !allOptionsSelected || displayPrice === 0}
        />
        <AddToQuoteButton
          productId={productId}
          variantId={useGroupedMode ? (matchedVariant?.id ?? null) : selectedVariantId}
          disabled={useGroupedMode && !allOptionsSelected}
        />
      </div>
    </div>
  );
}
