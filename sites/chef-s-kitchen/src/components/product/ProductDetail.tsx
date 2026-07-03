"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { AddToCartButton } from "./AddToCartButton";
import { AddToQuoteButton } from "./AddToQuoteButton";
import { OptionSelector } from "./OptionSelector";
import { Price } from "@/components/ui/Price";
import { PriceBlock } from "@/components/ui/PriceBlock";
import { Minus, Plus, Truck, ShieldCheck, PackageCheck } from "lucide-react";

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
  onVariantChange,
  memberPrice,
  isMember,
  membershipTeaser,
  productName,
  productSku,
  brandName,
  categoryName,
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
  onVariantChange?: (variantId: number | null) => void;
  memberPrice?: number | null;
  isMember?: boolean;
  /** Generic membership pitch for non-members — never carries the exact member price. */
  membershipTeaser?: { fromPrice: string | null } | null;
  /** Analytics enrichment for the add-to-cart events (GA4 + Klaviyo). */
  productName?: string;
  productSku?: string | null;
  brandName?: string;
  categoryName?: string;
}) {
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
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

  // Notify parent when active variant changes
  const activeVariantId = activeVariant?.id ?? null;
  useEffect(() => {
    onVariantChange?.(activeVariantId);
  }, [activeVariantId, onVariantChange]);

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
      {/* ═══ Pricing card — gold member border ties price to membership ═══ */}
      <div className="mt-5 rounded-[12px] border border-border border-l-4 border-l-member bg-steel-50 p-5">
        {displayPrice === 0 ? (
          <div>
            <p className="text-2xl font-bold text-text-primary">Call for Price</p>
            <p className="mt-1 text-[13px] text-text-secondary">
              Add this item to a quote and our sales team will price it for you.
            </p>
          </div>
        ) : (
          <PriceBlock
            rrp={displaySalePrice ?? displayPrice}
            memberPrice={memberPrice}
            isMember={isMember}
            planPrice={membershipTeaser?.fromPrice}
            size="pdp"
          />
        )}
      </div>

      {/* Bulk Pricing Tiers */}
      {bulkPricing.length > 0 && displayPrice > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-text-body mb-2">Bulk Pricing</h3>
          <div className="overflow-hidden rounded-[12px] border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-primary text-text-secondary">
                  <th className="px-3 py-2 text-left font-medium">Quantity</th>
                  <th className="px-3 py-2 text-right font-medium">Price Per Unit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {bulkPricing.map((rule) => {
                  const amount = parseFloat(rule.amount);
                  const tierPrice = rule.type === "percent"
                    ? displayPrice * (1 - amount / 100)
                    : amount;
                  return (
                    <tr key={rule.id} className="text-text-body">
                      <td className="px-3 py-2">
                        {rule.quantityMax
                          ? `${rule.quantityMin} – ${rule.quantityMax}`
                          : `${rule.quantityMin}+`}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Price amount={tierPrice} gst />
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
        <div className="mt-6 rounded-[12px] border border-border bg-surface-primary p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Configure</h3>
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

      {/* ═══ Qty + dual CTAs (design buy row) ═══ */}
      <div className="mt-6 flex flex-wrap items-stretch gap-3">
        {displayPrice > 0 && (
          <div className="flex items-center rounded-btn border border-border-strong bg-white">
            <button
              type="button"
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              aria-label="Decrease quantity"
              className="px-3 py-3 text-text-secondary transition-colors hover:text-text-primary"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="w-8 text-center text-sm font-semibold">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity(quantity + 1)}
              aria-label="Increase quantity"
              className="px-3 py-3 text-text-secondary transition-colors hover:text-text-primary"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row">
          {displayPrice > 0 ? (
            <>
              <AddToCartButton
                productId={productId}
                variantId={useGroupedMode ? (matchedVariant?.id ?? null) : selectedVariantId}
                quantity={quantity}
                disabled={!inStock || purchasingDisabled || !allOptionsSelected}
                productName={productName}
                sku={activeVariant?.sku ?? productSku}
                price={displaySalePrice ?? displayPrice}
                brandName={brandName}
                categoryName={categoryName}
              />
              <AddToQuoteButton
                productId={productId}
                variantId={useGroupedMode ? (matchedVariant?.id ?? null) : selectedVariantId}
                disabled={useGroupedMode && !allOptionsSelected}
              />
            </>
          ) : (
            <AddToQuoteButton
              productId={productId}
              variantId={useGroupedMode ? (matchedVariant?.id ?? null) : selectedVariantId}
              disabled={useGroupedMode && !allOptionsSelected}
              label="Add to Quote — request pricing"
            />
          )}
        </div>
      </div>
      {!inStock && displayPrice > 0 && (
        <p className="mt-2 text-[13px] font-semibold text-sale">Out of stock — add to a quote and we'll confirm availability.</p>
      )}

      {/* ═══ Delivery / warranty / stock trust row ═══ */}
      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-4 text-[13px] text-text-secondary">
        <span className="flex items-center gap-1.5">
          <Truck className="h-4 w-4 text-accent" strokeWidth={1.7} />
          Australia-wide delivery
        </span>
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="h-4 w-4 text-accent" strokeWidth={1.7} />
          Manufacturer warranty
        </span>
        <span className="flex items-center gap-1.5">
          <PackageCheck className={`h-4 w-4 ${inStock ? "text-brand" : "text-steel-400"}`} strokeWidth={1.7} />
          {inStock ? "In stock" : "Check availability"}
        </span>
      </div>

      {/* ═══ Mobile sticky buy bar ═══ */}
      {displayPrice > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-[90] flex items-center justify-between gap-3 border-t border-border bg-white px-4 py-3 shadow-lg lg:hidden">
          <div className="min-w-0">
            <Price
              amount={isMember && memberPrice != null && memberPrice < displayPrice ? memberPrice : (displaySalePrice ?? displayPrice)}
              gst
              className="text-lg font-bold text-text-primary"
            />
            <span className="ml-1 text-[10px] font-semibold text-steel-400">{isMember && memberPrice != null ? "member" : "ex GST"}</span>
          </div>
          <AddToCartButton
            productId={productId}
            variantId={useGroupedMode ? (matchedVariant?.id ?? null) : selectedVariantId}
            quantity={quantity}
            size="sm"
            disabled={!inStock || purchasingDisabled || !allOptionsSelected}
            productName={productName}
            sku={activeVariant?.sku ?? productSku}
            price={displaySalePrice ?? displayPrice}
            brandName={brandName}
            categoryName={categoryName}
          />
        </div>
      )}
    </div>
  );
}