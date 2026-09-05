"use client";

// ============================================================================
// CMS v2 locked widgets — Chef's Depot fork.
//
// The interactive pieces placeable inside KTL templates via {{widget name}}.
// Schemas live in @keenan/services cms/widgets.ts; THIS map is what the fork
// actually implements (advertised via /api/blocks/manifest). Each widget is a
// verbatim slice of the legacy ProductDetail/ProductPageClient JSX, reading
// state from ProductPurchaseProvider — the same implementation the legacy
// monolith uses, so the two paths cannot drift.
// ============================================================================

import type { FC } from "react";
import type { RenderContext } from "@keenan/services";
import { Minus, Plus, Truck, ShieldCheck } from "lucide-react";
import { ProductImageGallery } from "@/components/product/ProductImageGallery";
import { AddToCartButton } from "@/components/product/AddToCartButton";
import { AddToQuoteButton } from "@/components/product/AddToQuoteButton";
import { OptionSelector } from "@/components/product/OptionSelector";
import { Price } from "@/components/ui/Price";
import { PriceBlock } from "@/components/ui/PriceBlock";
import { useProductPurchaseOptional } from "@/components/product/ProductPurchaseProvider";

export type WidgetComponent = FC<{ attrs: Record<string, unknown>; ctx?: RenderContext }>;

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Draft-friendly notice when a purchase widget renders outside the provider. */
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

export const PriceWidget: WidgetComponent = ({ attrs }) => {
  const purchase = useProductPurchaseOptional();
  if (!purchase) return <NoProvider name="price" />;
  const { displayPrice, displaySalePrice, activeMemberPrice, isMember, membershipTeaser } =
    purchase;
  // Non-members get a percentage for the join teaser; account holders get their
  // contract price labelled as one rather than as a membership perk.
  const { memberSavingsPct, accountPricing } = purchase;
  // size="card": the LISTING-card pricing look (bare PriceBlock, RRP not sale
  // — the save badge carries the discount), verbatim from ProductCard.tsx.
  if (attrs.size === "card") {
    return displayPrice > 0 ? (
      <PriceBlock
        rrp={displayPrice}
        memberPrice={activeMemberPrice}
        isMember={isMember}
        planPrice={membershipTeaser?.fromPrice}
        memberSavingsPct={memberSavingsPct}
        accountPricing={accountPricing}
        size="card"
      />
    ) : (
      <p className="text-sm font-semibold text-text-secondary">Call for Price</p>
    );
  }
  return (
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
          memberPrice={activeMemberPrice}
          isMember={isMember}
          planPrice={membershipTeaser?.fromPrice}
          memberSavingsPct={memberSavingsPct}
          accountPricing={accountPricing}
          size="pdp"
        />
      )}
    </div>
  );
};

export const BulkPricingWidget: WidgetComponent = () => {
  const purchase = useProductPurchaseOptional();
  if (!purchase) return null;
  // The product's OWN price, without any paid extras the shopper has ticked (card
  // 0CDcCYmO). A quantity break is a discount off the MACHINE, so working a percent tier
  // off a price that already carries $480 of blades would quietly discount the blades too.
  const { product, displayBasePrice: displayPrice } = purchase;
  if (product.bulkPricing.length === 0 || displayPrice <= 0) return null;
  return (
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
            {product.bulkPricing.map((rule) => {
              const amount = parseFloat(rule.amount);
              const tierPrice =
                rule.type === "percent" ? displayPrice * (1 - amount / 100) : amount;
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
  );
};

export const OptionSelectorWidget: WidgetComponent = () => {
  const purchase = useProductPurchaseOptional();
  if (!purchase) return null;
  const { product, useGroupedMode, selectedOptions, disabledValuesPerOption, selectOption } =
    purchase;
  if (!useGroupedMode) return null;
  return (
    <div className="mt-6 rounded-[12px] border border-border bg-surface-primary p-5">
      <h3 className="text-sm font-semibold text-text-primary mb-4">Configure</h3>
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

export const QuantityWidget: WidgetComponent = () => {
  const purchase = useProductPurchaseOptional();
  if (!purchase) return null;
  const { displayPrice, quantity, setQuantity } = purchase;
  if (displayPrice <= 0) return null;
  return (
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
  );
};

export const AddToCartWidget: WidgetComponent = ({ attrs }) => {
  const purchase = useProductPurchaseOptional();
  if (!purchase) return <NoProvider name="add_to_cart" />;
  const {
    product,
    displayPrice,
    quantity,
    cartVariantId,
    purchaseBlockedByStock,
    restrictAddToCart,
    purchasingDisabled,
    allOptionsSelected,
  } = purchase;
  // Also covers a product staff set to Hide Price: the provider masks its amounts to zero, so it
  // takes the same quote-only path a genuinely unpriced product takes (7vu2iEEZ).
  if (displayPrice <= 0) return null; // POA items sell via quote only
  // A product staff switched off for cart, or set to refuse out-of-stock buys, shows NO button at
  // all rather than a greyed one — there is no availability wording left on this site to explain a
  // dead control (cards 7vu2iEEZ + CXnP1lrL). Add to Quote is still there.
  if (restrictAddToCart || purchaseBlockedByStock) return null;
  return (
    <AddToCartButton
      productId={product.id}
      // The ticked extras travel with the click (card 0CDcCYmO) — their price is already in
      // the displayed price, and the server re-resolves every amount from the product itself.
      // Posted only where the panel was actually OFFERED, exactly as the quote control below is:
      // this renderer builds its provider payload BY HAND and passes no `addons`, so it shows no
      // extras panel — and handing it `{}` would answer a required group the shopper was never
      // asked, refusing the add with "Please choose X" on a page carrying no such control.
      addons={purchase.addonGroupsOffered ? purchase.selectedAddons : undefined}
      variantId={cartVariantId}
      quantity={quantity}
      size={attrs.size === "sm" ? "sm" : undefined}
      disabled={purchasingDisabled || !allOptionsSelected}
    />
  );
};

export const AddToQuoteWidget: WidgetComponent = ({ attrs }) => {
  const purchase = useProductPurchaseOptional();
  if (!purchase) return <NoProvider name="add_to_quote" />;
  const {
    product,
    displayPrice,
    cartVariantId,
    useGroupedMode,
    allOptionsSelected,
    restrictAddToQuote,
    selectedAddons,
    addonGroupsUnanswered,
    addonGroupsOffered,
  } = purchase;
  // Zoey "Restrict Add to Quote" — the button simply is not offered for this product (7vu2iEEZ).
  if (restrictAddToQuote) return null;
  return (
    <AddToQuoteButton
      productId={product.id}
      variantId={cartVariantId}
      size={attrs.size === "sm" ? "sm" : undefined}
      // Card 0CDcCYmO. This renderer is the fallback both sites fall back to when
      // `node_product_template_enabled` is switched off, so the ticked extras travel with THIS
      // button too — a quote path that silently dropped them hands the rep a bare machine. A
      // required group greys the button here as it does on the coded buy box, and the action
      // refuses it again server-side. A selection is posted only where the panel was actually
      // OFFERED: this renderer builds its provider input by hand and does not pass `addons`, and
      // an empty object would read as a deliberate clear-down of a configuration made elsewhere.
      addons={addonGroupsOffered ? selectedAddons : undefined}
      disabled={(useGroupedMode && !allOptionsSelected) || addonGroupsUnanswered.length > 0}
      label={
        str(attrs.label) ||
        (displayPrice <= 0 ? "Add to Quote — request pricing" : undefined)
      }
    />
  );
};

// Registered under the `stock_status` widget key (kept — the key is the builder
// seam and renaming it would orphan every page that references it). It renders
// the product trust row, which per card CXnP1lrL states NO stock status: the
// storefront never says "In stock" / "Check availability".
export const StockStatusWidget: WidgetComponent = () => {
  const purchase = useProductPurchaseOptional();
  if (!purchase) return null;
  return (
    <>
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
    </>
  );
};

export const MobileBuyBarWidget: WidgetComponent = () => {
  const purchase = useProductPurchaseOptional();
  if (!purchase) return null;
  const {
    product,
    displayPrice,
    displaySalePrice,
    activeMemberPrice: memberPrice,
    isMember,
    quantity,
    cartVariantId,
    purchaseBlockedByStock,
    restrictAddToCart,
    purchasingDisabled,
    allOptionsSelected,
  } = purchase;
  if (displayPrice <= 0) return null;
  // The bar is a price and an Add to Cart and nothing else, so a product whose cart button is
  // refused has no bar left worth rendering — a price strip with the button taken out reads as a
  // broken bar. Same call as `showMobileBar` in the shared bridge (7vu2iEEZ).
  if (restrictAddToCart || purchaseBlockedByStock) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-[90] flex items-center justify-between gap-3 border-t border-border bg-white px-4 py-3 shadow-lg lg:hidden">
      <div className="min-w-0">
        <Price
          amount={
            memberPrice != null && memberPrice < displayPrice
              ? memberPrice
              : (displaySalePrice ?? displayPrice)
          }
          gst
          className="text-lg font-bold text-text-primary"
        />
        <span className="ml-1 text-[10px] font-semibold text-steel-400">
          {memberPrice != null && memberPrice < displayPrice
            ? (isMember ? "member" : "your price")
            : "ex GST"}
        </span>
      </div>
      <AddToCartButton
        productId={product.id}
        variantId={cartVariantId}
        quantity={quantity}
        // The mobile bar buys the same configuration the panel above it shows — the ticked
        // extras are already in the price beside this button (card 0CDcCYmO). Posted only where
        // that panel was actually OFFERED: this renderer builds its provider payload by hand and
        // passes no `addons`, and `{}` would read as an answer to a question never asked, refusing
        // the add over a required group with no control on screen to satisfy it.
        addons={purchase.addonGroupsOffered ? purchase.selectedAddons : undefined}
        size="sm"
        disabled={purchasingDisabled || !allOptionsSelected}
      />
    </div>
  );
};

export const ReviewStarsWidget: WidgetComponent = ({ ctx }) => {
  const extras =
    ctx?.record?.kind === "product"
      ? (ctx.record.extras as { reviewSummary?: { avg: number; count: number } | null } | undefined)
      : undefined;
  const reviewSummary = extras?.reviewSummary;
  if (!reviewSummary || reviewSummary.count <= 0) return null;
  return (
    <p className="flex items-center gap-1 text-[13px] text-text-secondary">
      <span className="text-member" aria-hidden>
        {"★".repeat(Math.round(reviewSummary.avg))}
        <span className="text-steel-300">{"★".repeat(5 - Math.round(reviewSummary.avg))}</span>
      </span>
      {reviewSummary.avg.toFixed(1)} · {reviewSummary.count} review
      {reviewSummary.count === 1 ? "" : "s"}
    </p>
  );
};


