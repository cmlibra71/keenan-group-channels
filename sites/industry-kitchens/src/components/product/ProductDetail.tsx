"use client";

// ============================================================================
// ProductDetail — price, membership teaser, bulk tiers, option selectors, CTAs.
// CMS v2.1 refactor: state/derived values come from ProductPurchaseProvider
// (one implementation shared with the v2 widgets). JSX below is verbatim from
// the pre-provider version — pixel parity is the contract.
// ============================================================================

import Link from "next/link";
import { AddToCartButton } from "./AddToCartButton";
import { AddToQuoteButton } from "./AddToQuoteButton";
import { OptionSelector } from "./OptionSelector";
import { Price } from "@/components/ui/Price";
import { useProductPurchase } from "./ProductPurchaseProvider";

export function ProductDetail() {
  const {
    product,
    isMember,
    membershipTeaser,
    selectedOptions,
    selectOption,
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

  return (
    <div>
      {/* Price */}
      {isMember && memberPrice != null && displayPrice > 0 && memberPrice < (displaySalePrice ?? displayPrice) ? (
        /* Member view: standard struck through, member price prominent with savings */
        <div className="mt-4">
          <div className="flex items-baseline gap-2">
            <span className="text-xl text-zinc-400 line-through">
              <Price amount={displaySalePrice ?? displayPrice} gst />
            </span>
            <span className="text-sm text-zinc-500">(Standard)</span>
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-2">
            <Price amount={memberPrice} gst className="text-3xl font-bold text-green-700" />
            <span className="text-sm font-semibold text-green-700">
              (Member Price, Save <Price amount={(displaySalePrice ?? displayPrice) - memberPrice} gst />)
            </span>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex items-center gap-3">
          {displayPrice === 0 ? (
            <span className="text-2xl font-bold text-zinc-900">Call for Price</span>
          ) : displaySalePrice ? (
            <>
              <Price amount={displaySalePrice} gst className="text-3xl font-bold text-red-600" />
              <span className="text-xl text-zinc-400 line-through">
                <Price amount={displayPrice} gst />
              </span>
            </>
          ) : (
            <Price amount={displayPrice} gst className="text-3xl font-bold text-zinc-900" />
          )}
        </div>
      )}

      {/* Membership teaser — generic pitch only; the exact member price is
          reserved for active subscribers. */}
      {!isMember && membershipTeaser && displayPrice > 0 && (
        <Link
          href="/membership"
          className="mt-3 block rounded-lg border border-emerald-200 bg-emerald-50 p-3 hover:bg-emerald-100 transition-colors"
        >
          <p className="text-sm font-semibold text-emerald-800">Members save 10&ndash;25% off retail</p>
          <p className="text-xs text-emerald-600 mt-1">
            Plus prize draw entries, exclusive partner discounts &amp; priority support
          </p>
          <span className="text-xs font-semibold text-emerald-700 mt-1 inline-block">
            {membershipTeaser.fromPrice ? <>Join from ${membershipTeaser.fromPrice}/month &rarr;</> : <>Join now &rarr;</>}
          </span>
        </Link>
      )}

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
                  const amount = parseFloat(rule.amount);
                  const tierPrice = rule.type === "percent"
                    ? displayPrice * (1 - amount / 100)
                    : amount;
                  return (
                    <tr key={rule.id} className="text-zinc-700">
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
                onSelect={selectOption}
              />
            ))}
          </div>
        </div>
      )}

      {/* Add to Cart / Quote */}
      <div className="mt-8 space-y-3">
        <AddToCartButton
          productId={productId}
          variantId={cartVariantId}
          disabled={!inStock || purchasingDisabled || !allOptionsSelected || displayPrice === 0}
        />
        <AddToQuoteButton
          productId={productId}
          variantId={cartVariantId}
          disabled={useGroupedMode && !allOptionsSelected}
        />
      </div>
    </div>
  );
}
