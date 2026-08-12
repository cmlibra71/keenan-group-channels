"use client";

// ============================================================================
// ProductDetail — the buy panel (price card, bulk tiers, option selectors,
// quantity, CTAs, trust row, mobile buy bar).
//
// CMS v2 refactor: ALL state and derived values now come from
// ProductPurchaseProvider (one implementation shared with the v2 widgets).
// The JSX below is verbatim from the pre-provider version — pixel parity is
// the contract; do not restyle here without a parity gate.
// ============================================================================

import Link from "next/link";
import { AddToCartButton } from "./AddToCartButton";
import { AddToQuoteButton } from "./AddToQuoteButton";
import { OptionSelector } from "./OptionSelector";
import { Price } from "@/components/ui/Price";
import { PriceBlock } from "@/components/ui/PriceBlock";
import { Minus, Plus, Truck, ShieldCheck } from "lucide-react";
import { useProductPurchase } from "./ProductPurchaseProvider";
import { useGst } from "@/lib/gst";

export function ProductDetail() {
  const {
    product,
    isMember,
    membershipTeaser,
    selectedOptions,
    selectOption,
    quantity,
    setQuantity,
    useGroupedMode,
    disabledValuesPerOption,
    activeMemberPrice: memberPrice,
    displayPrice,
    displaySalePrice,
    inStock,
    purchasingDisabled,
    allOptionsSelected,
    cartVariantId,
  } = useProductPurchase();

  const { id: productId, options, optionValues, bulkPricing } = product;
  // The sticky buy bar labels its own figure. It used to hard-code "ex GST",
  // which was only ever invisible because CD phones had no way to switch.
  const { inclusive } = useGst();

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
                onSelect={selectOption}
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
                variantId={cartVariantId}
                quantity={quantity}
                productName={product.name}
                sku={product.sku}
                price={displaySalePrice ?? displayPrice}
                disabled={!inStock || purchasingDisabled || !allOptionsSelected}
              />
              <AddToQuoteButton
                productId={productId}
                variantId={cartVariantId}
                disabled={useGroupedMode && !allOptionsSelected}
              />
            </>
          ) : (
            <AddToQuoteButton
              productId={productId}
              variantId={cartVariantId}
              disabled={useGroupedMode && !allOptionsSelected}
              label="Add to Quote — request pricing"
            />
          )}
        </div>
      </div>

      {/* ═══ Delivery / warranty trust row ═══
          HARD RULE (card CXnP1lrL): the storefront NEVER states stock status —
          no "In stock", no "Check availability". Delivery + warranty only. */}
      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-4 text-[13px] text-text-secondary">
        <span className="flex items-center gap-1.5">
          <Truck className="h-4 w-4 text-accent" strokeWidth={1.7} />
          Australia-wide delivery
        </span>
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="h-4 w-4 text-accent" strokeWidth={1.7} />
          Manufacturer warranty
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
            <span className="ml-1 text-[10px] font-semibold text-steel-400">{isMember && memberPrice != null ? "member" : inclusive ? "inc GST" : "ex GST"}</span>
          </div>
          <AddToCartButton
            productId={productId}
            variantId={cartVariantId}
            quantity={quantity}
            productName={product.name}
            sku={product.sku}
            price={displaySalePrice ?? displayPrice}
            size="sm"
            disabled={!inStock || purchasingDisabled || !allOptionsSelected}
          />
        </div>
      )}
    </div>
  );
}

// Link import kept out of the refactor scope on purpose — some branches of the
// legacy JSX referenced it; keeping the import list stable avoids churn.
void Link;
