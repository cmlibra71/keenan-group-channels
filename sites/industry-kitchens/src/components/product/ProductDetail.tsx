"use client";

// ============================================================================
// ProductDetail — price, membership teaser, bulk tiers, option selectors, CTAs.
// CMS v2.1 refactor: state/derived values come from ProductPurchaseProvider
// (one implementation shared with the v2 widgets). JSX below is verbatim from
// the pre-provider version — pixel parity is the contract.
// ============================================================================

import { useState } from "react";
import Link from "next/link";
import { AddToCartButton } from "./AddToCartButton";
import { AddToQuoteButton } from "./AddToQuoteButton";
import { OptionSelector } from "./OptionSelector";
import { Price } from "@/components/ui/Price";
import { GstToggle } from "@/components/layout/GstToggle";
import { useProductPurchase } from "./ProductPurchaseProvider";
import { ProductKitBlock } from "./ProductKitBlock";
import { defaultKitSelection, toKitChoices, type ProductKit } from "@/lib/product-kit";

/**
 * `kit` is present only for the two Zoey kit types (grouped / bundle). Every other caller — the
 * CMS v2 widgets, the builder natives — renders this exactly as before by simply not passing one.
 */
export function ProductDetail({ kit }: { kit?: ProductKit | null } = {}) {
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
    purchaseBlockedByStock,
    restrictAddToCart,
    restrictAddToQuote,
    hidePrice,
    purchasingDisabled,
    allOptionsSelected,
    cartVariantId,
  } = useProductPurchase();

  const { id: productId, options, optionValues, bulkPricing } = product;

  // A bundle's configuration lives here rather than in the purchase provider: it never becomes a
  // cart price (it is quoted), so it has no business in the pricing state the two storefronts and
  // the portal editor share.
  const [kitSelection, setKitSelection] = useState<Record<string, number>>(() =>
    kit?.kind === "bundle" ? defaultKitSelection(kit.groups) : {}
  );
  const isBundle = kit?.kind === "bundle";
  const kitReady = !isBundle || kit.groups.every((g) => kitSelection[g.name] != null);

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

      {/* The ex/inc-GST switch. It used to sit in the header; it now lives with
          the price it controls, in normal flow so it renders at every
          breakpoint (phones included). A "Call for Price" product has no price
          to convert, so it gets none. */}
      {displayPrice > 0 && <GstToggle className="mt-3" />}

      {/* Membership teaser — generic pitch only; the exact member price is
          reserved for active subscribers. */}
      {!isMember && membershipTeaser && displayPrice > 0 && (
        <Link
          href="/membership"
          className="mt-3 block rounded-lg border border-emerald-200 bg-emerald-50 p-3 hover:bg-emerald-100 transition-colors"
        >
          <p className="text-sm font-semibold text-emerald-800">Members buy at a different price tier</p>
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

      {/* Kit contents (grouped) / choice groups (bundle) */}
      {kit && (
        <ProductKitBlock
          kit={kit}
          selection={kitSelection}
          onSelect={(group, id) => setKitSelection((prev) => ({ ...prev, [group]: id }))}
        />
      )}

      {/* Add to Cart / Quote */}
      <div className="mt-8 space-y-3">
        {/* A bundle is never bought straight off the page — the configuration goes to a rep. */}
        {/* Card 7vu2iEEZ: a product staff switched off for cart, set to hide its price, or set to
            refuse out-of-stock buys shows NO cart button rather than a greyed one — this site
            carries no availability wording that could explain a dead control (CXnP1lrL). A product
            with no price at all takes the same exit, which is what Chefs Depot's fork of this file
            has always done; `hidePrice` reaches here as a zero price through the provider, and is
            named as well so the reason is readable. */}
        {displayPrice > 0 && !isBundle && !hidePrice && !restrictAddToCart && !purchaseBlockedByStock && (
          <AddToCartButton
            productId={productId}
            variantId={cartVariantId}
            productName={product.name}
            sku={product.sku}
            price={displaySalePrice ?? displayPrice}
            disabled={purchasingDisabled || !allOptionsSelected}
          />
        )}
        {!restrictAddToQuote && (
          <AddToQuoteButton
            productId={productId}
            variantId={cartVariantId}
            disabled={(useGroupedMode && !allOptionsSelected) || !kitReady}
            kitChoices={isBundle ? toKitChoices(kitSelection) : null}
            label={isBundle ? "Add to Quote — request pricing" : undefined}
          />
        )}
      </div>
    </div>
  );
}
