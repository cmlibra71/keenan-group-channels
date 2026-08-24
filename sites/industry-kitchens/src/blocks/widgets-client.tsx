"use client";

// ============================================================================
// CMS v2 locked widgets — template/IK fork (client implementations).
// Verbatim slices of ProductDetail/ProductPageClient, reading state from
// ProductPurchaseProvider — the same implementation the legacy monolith uses.
// ============================================================================

import type { FC } from "react";
import Link from "next/link";
import type { RenderContext } from "@keenan/services";
import { ProductImageGallery } from "@/components/product/ProductImageGallery";
import { AddToCartButton } from "@/components/product/AddToCartButton";
import { AddToQuoteButton } from "@/components/product/AddToQuoteButton";
import { OptionSelector } from "@/components/product/OptionSelector";
import { Price } from "@/components/ui/Price";
import { useProductPurchaseOptional } from "@/components/product/ProductPurchaseProvider";

export type WidgetComponent = FC<{ attrs: Record<string, unknown>; ctx?: RenderContext }>;

function NoProvider({ name }: { name: string }) {
  return (
    <span className="inline-block rounded border border-dashed border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-700">
      {name} needs a product context
    </span>
  );
}

export const ProductGalleryWidget: WidgetComponent = () => {
  const purchase = useProductPurchaseOptional();
  if (!purchase) return <NoProvider name="product_gallery" />;
  const { product, variantImageUrl } = purchase;
  return (
    <ProductImageGallery
      images={product.images}
      productName={product.name}
      variantImageUrl={variantImageUrl}
      videos={product.videos ?? []}
    />
  );
};

export const PriceWidget: WidgetComponent = () => {
  const purchase = useProductPurchaseOptional();
  if (!purchase) return <NoProvider name="price" />;
  const {
    displayPrice,
    displaySalePrice,
    activeMemberPrice: memberPrice,
    isMember,
    membershipTeaser,
  } = purchase;
  return (
    <>
      {isMember && memberPrice != null && displayPrice > 0 && memberPrice < (displaySalePrice ?? displayPrice) ? (
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
    </>
  );
};

export const BulkPricingWidget: WidgetComponent = () => {
  const purchase = useProductPurchaseOptional();
  if (!purchase) return null;
  const { product, displayPrice } = purchase;
  if (product.bulkPricing.length === 0 || displayPrice <= 0) return null;
  return (
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
            {product.bulkPricing.map((rule) => {
              const amount = parseFloat(rule.amount);
              const tierPrice = rule.type === "percent" ? displayPrice * (1 - amount / 100) : amount;
              return (
                <tr key={rule.id} className="text-zinc-700">
                  <td className="px-3 py-2">
                    {rule.quantityMax ? `${rule.quantityMin} – ${rule.quantityMax}` : `${rule.quantityMin}+`}
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
  );
};

export const OptionSelectorWidget: WidgetComponent = () => {
  const purchase = useProductPurchaseOptional();
  if (!purchase) return null;
  const { product, useGroupedMode, selectedOptions, disabledValuesPerOption, selectOption } = purchase;
  if (!useGroupedMode) return null;
  return (
    <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-5">
      <h3 className="text-sm font-semibold text-zinc-900 mb-4">Configure</h3>
      <div className="space-y-5">
        {product.options.map((option) => (
          <OptionSelector
            key={option.id}
            option={option}
            values={product.optionValues.filter((v) => v.optionId === option.id)}
            selectedValueId={selectedOptions[option.id] ?? null}
            disabledValueIds={disabledValuesPerOption.get(option.id) ?? new Set()}
            onSelect={selectOption}
          />
        ))}
      </div>
    </div>
  );
};

export const AddToCartWidget: WidgetComponent = () => {
  const purchase = useProductPurchaseOptional();
  if (!purchase) return <NoProvider name="add_to_cart" />;
  const {
    product,
    displayPrice,
    cartVariantId,
    purchaseBlockedByStock,
    restrictAddToCart,
    purchasingDisabled,
    allOptionsSelected,
  } = purchase;
  // A product staff switched off for cart, or set to refuse out-of-stock buys, shows NO button at
  // all rather than a greyed one — there is no availability wording left on this site to explain a
  // dead control (cards 7vu2iEEZ + CXnP1lrL). Add to Quote is still there.
  if (restrictAddToCart || purchaseBlockedByStock) return null;
  // A product with no price sells by quote only, and a product staff set to Hide Price has its
  // amounts masked to zero by the provider so it lands here too. This used to render the button
  // greyed, which is the same dead control by another name — and Chefs Depot's fork of this widget
  // has always returned null. Both sites now do (7vu2iEEZ, Tim's "the same on ALL sites").
  if (displayPrice <= 0) return null;
  return (
    <AddToCartButton
      productId={product.id}
      variantId={cartVariantId}
      disabled={purchasingDisabled || !allOptionsSelected}
    />
  );
};

export const AddToQuoteWidget: WidgetComponent = () => {
  const purchase = useProductPurchaseOptional();
  if (!purchase) return <NoProvider name="add_to_quote" />;
  const { product, cartVariantId, useGroupedMode, allOptionsSelected, restrictAddToQuote } =
    purchase;
  // Zoey "Restrict Add to Quote" — the button simply is not offered for this product (7vu2iEEZ).
  if (restrictAddToQuote) return null;
  return (
    <AddToQuoteButton
      productId={product.id}
      variantId={cartVariantId}
      disabled={useGroupedMode && !allOptionsSelected}
    />
  );
};
