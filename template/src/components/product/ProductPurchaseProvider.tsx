"use client";

// ============================================================================
// ProductPurchaseProvider — the single home of product-purchase state.
//
// Lifts what used to be split across ProductPageClient (selectedVariantId) and
// ProductDetail (selectedOptions, quantity, derived variant/price/stock) into
// one context so INDEPENDENTLY-PLACED pieces stay in sync: the legacy
// monolithic buy box AND the CMS v2 widgets (gallery / price / options /
// quantity / add-to-cart / stock) consume the same implementation — parity by
// construction, one place to regression-test the checkout-adjacent logic.
// ============================================================================

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ProductImage } from "./ProductImageGallery";

export type PurchaseVariant = {
  id: number;
  sku: string | null;
  price: string | null;
  salePrice: string | null;
  imageUrl: string | null;
  optionDisplayName: string | null;
  purchasingDisabled: boolean | null;
  inventoryLevel: number | null;
};

export type PurchaseOption = {
  id: number;
  displayName: string;
  type: string;
  sortOrder: number | null;
  isRequired: boolean | null;
};

export type PurchaseOptionValue = {
  id: number;
  optionId: number;
  label: string;
  valueData: unknown;
  sortOrder: number | null;
};

export type PurchaseVariantOptionMapping = {
  id: number;
  variantId: number;
  optionId: number;
  optionValueId: number;
};

export type PurchaseBulkPricingRule = {
  id: number;
  quantityMin: number;
  quantityMax: number | null;
  type: string;
  amount: string;
};

export interface PurchaseProduct {
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
  variants: PurchaseVariant[];
  options: PurchaseOption[];
  optionValues: PurchaseOptionValue[];
  variantOptionMappings: PurchaseVariantOptionMapping[];
  bulkPricing: PurchaseBulkPricingRule[];
}

export interface ProductPurchaseState {
  product: PurchaseProduct;
  memberPriceMap: Record<number, number>;
  isMember: boolean;
  membershipTeaser: { fromPrice: string | null } | null;

  // raw state
  selectedVariantId: number | null;
  setSelectedVariantId: (id: number | null) => void;
  selectedOptions: Record<number, number>;
  selectOption: (optionId: number, valueId: number) => void;
  quantity: number;
  setQuantity: (n: number) => void;

  // derived (single source of truth — mirrors legacy ProductDetail useMemos)
  useGroupedMode: boolean;
  matchedVariant: PurchaseVariant | null;
  disabledValuesPerOption: Map<number, Set<number>>;
  activeVariant: PurchaseVariant | null;
  activeVariantId: number | null;
  variantImageUrl: string | null;
  activeMemberPrice: number | null;
  displayPrice: number;
  displaySalePrice: number | null;
  inStock: boolean;
  purchasingDisabled: boolean;
  allOptionsSelected: boolean;
  cartVariantId: number | null;
}

const ProductPurchaseContext = createContext<ProductPurchaseState | null>(null);

export function useProductPurchase(): ProductPurchaseState {
  const ctx = useContext(ProductPurchaseContext);
  if (!ctx) {
    throw new Error("useProductPurchase must be used within ProductPurchaseProvider");
  }
  return ctx;
}

/** Null-safe variant for widgets that may render outside a product page. */
export function useProductPurchaseOptional(): ProductPurchaseState | null {
  return useContext(ProductPurchaseContext);
}

export function ProductPurchaseProvider({
  product,
  memberPrice = null,
  memberPriceMap = {},
  isMember = false,
  membershipTeaser = null,
  onVariantChange,
  children,
}: {
  product: PurchaseProduct;
  memberPrice?: number | null;
  memberPriceMap?: Record<number, number>;
  isMember?: boolean;
  membershipTeaser?: { fromPrice: string | null } | null;
  /** legacy bridge — ProductPageClient no longer needs this, but kept for API compat */
  onVariantChange?: (variantId: number | null) => void;
  children: React.ReactNode;
}) {
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [selectedOptions, setSelectedOptions] = useState<Record<number, number>>({});

  const { variants, options, optionValues, variantOptionMappings } = product;
  const useGroupedMode = options.length > 0 && variantOptionMappings.length > 0;

  // Build variant lookup: sorted "optionId:valueId,..." → variant  (verbatim
  // from the legacy ProductDetail — do not "improve" without a parity gate)
  const variantLookup = useMemo(() => {
    if (!useGroupedMode) return new Map<string, PurchaseVariant>();
    const map = new Map<string, PurchaseVariant>();
    const byVariant = new Map<number, PurchaseVariantOptionMapping[]>();
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

  const matchedVariant = useMemo(() => {
    if (!useGroupedMode) return null;
    if (Object.keys(selectedOptions).length !== options.length) return null;
    const key = Object.entries(selectedOptions)
      .map(([optId, valId]) => `${optId}:${valId}`)
      .sort()
      .join(",");
    return variantLookup.get(key) ?? null;
  }, [useGroupedMode, selectedOptions, options.length, variantLookup]);

  const disabledValuesPerOption = useMemo(() => {
    if (!useGroupedMode) return new Map<number, Set<number>>();
    const result = new Map<number, Set<number>>();
    for (const option of options) {
      const disabled = new Set<number>();
      const valuesForOption = optionValues.filter((v) => v.optionId === option.id);
      const otherSelections = { ...selectedOptions };
      delete otherSelections[option.id];
      for (const val of valuesForOption) {
        const testSelections = { ...otherSelections, [option.id]: val.id };
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

  const selectOption = (optionId: number, valueId: number) => {
    setSelectedOptions((prev) => ({ ...prev, [optionId]: valueId }));
  };

  const activeVariant = useGroupedMode
    ? matchedVariant
    : variants.find((v) => v.id === selectedVariantId) ?? null;
  const activeVariantId = activeVariant?.id ?? null;

  // legacy bridge for any residual parent listeners
  useEffect(() => {
    onVariantChange?.(activeVariantId);
  }, [activeVariantId, onVariantChange]);

  const variantImageUrl = activeVariant?.imageUrl ?? null;
  const activeMemberPrice =
    activeVariantId != null && memberPriceMap[activeVariantId] != null
      ? memberPriceMap[activeVariantId]
      : memberPrice ?? null;

  const displayPrice = activeVariant?.price
    ? parseFloat(activeVariant.price)
    : parseFloat(product.price);
  const displaySalePrice = activeVariant?.salePrice
    ? parseFloat(activeVariant.salePrice)
    : activeVariant
      ? null
      : product.salePrice
        ? parseFloat(product.salePrice)
        : null;

  const inStock = (() => {
    if ((product.availability ?? "available") === "disabled") return false;
    if ((product.inventoryTracking ?? "none") === "none") return true;
    if (activeVariant) {
      return (activeVariant.inventoryLevel ?? 0) > 0;
    }
    return (product.inventoryLevel ?? 0) > 0;
  })();

  const purchasingDisabled = activeVariant?.purchasingDisabled ?? false;
  const allOptionsSelected = useGroupedMode
    ? Object.keys(selectedOptions).length === options.length && matchedVariant !== null
    : true;
  const cartVariantId = useGroupedMode ? (matchedVariant?.id ?? null) : selectedVariantId;

  const value: ProductPurchaseState = {
    product,
    memberPriceMap,
    isMember,
    membershipTeaser,
    selectedVariantId,
    setSelectedVariantId,
    selectedOptions,
    selectOption,
    quantity,
    setQuantity,
    useGroupedMode,
    matchedVariant,
    disabledValuesPerOption,
    activeVariant,
    activeVariantId,
    variantImageUrl,
    activeMemberPrice,
    displayPrice,
    displaySalePrice,
    inStock,
    purchasingDisabled,
    allOptionsSelected,
    cartVariantId,
  };

  return (
    <ProductPurchaseContext.Provider value={value}>{children}</ProductPurchaseContext.Provider>
  );
}
