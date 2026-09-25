"use client";

// ============================================================================
// ProductKitBlock — what a GROUPED or BUNDLE product shows on its page.
//
// GROUPED: "What's included" — the fixed contents, for information. The kit is bought at its own
// single price and goes through as ONE line, so the normal buy buttons apply unchanged.
//
// BUNDLE (card Tc5ekvD6 — Zoey's bundled product, support.zoey.com/docs/bundled-product): one
// picker per choice group, starting on the author's defaults; an optional group offers "None"; a
// required group of ONE product is a part that is always included and is shown, not asked. Each
// choice carries its price for THIS shopper and the page's headline moves as they choose (Zoey's
// dynamic price, "Price as configured") — the money is the purchase provider's, handed the build
// by `KitPurchaseProvider`, so this block prints the same figure the buy box and the cart use.
// The block has NO buy button of its own: the page's ordinary Add to Cart and Add to Quote carry
// the build (two identical CTAs is what the first cut of 7bmpuqei shipped and it read as a bug).
//
// Chefs Depot copy of the template component, restyled onto the design system tokens. The logic
// is the template's line for line — only class names differ — and the money rules live in the
// shared `bundle-money.ts`, so the two copies cannot say different things about a price.
// ============================================================================

import { Package } from "lucide-react";
import { useProductPurchaseOptional } from "@keenan/services/product-page";
import { Price } from "@/components/ui/Price";
import { isFixedGroup, type KitGroup, type KitPrices, type ProductKit } from "@/lib/product-kit";
import { useKitSelection } from "./KitSelection";
import { bundleMoney } from "./bundle-money";

export function ProductKitBlock({ kit }: { kit: ProductKit }) {
  const live = useKitSelection();
  const purchase = useProductPurchaseOptional();

  if (kit.kind === "grouped") {
    return (
      <div className="mt-6 rounded-[12px] border border-border bg-surface-primary p-5">
        <h3 className="mb-3 text-sm font-semibold text-text-primary">What&apos;s included</h3>
        <ul className="space-y-2">
          {kit.items.map((item) => (
            <li key={item.productId} className="flex items-start gap-2 text-sm text-text-body">
              <Package className="mt-0.5 h-4 w-4 shrink-0 text-accent" strokeWidth={1.7} />
              <span>
                <span className="font-semibold text-text-primary">{item.quantity} ×</span>{" "}
                {item.name}
                {item.sku && <span className="ml-1 spec-mono">({item.sku})</span>}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[13px] text-text-secondary">
          Sold together for one price — everything above arrives as a single kit.
        </p>
      </div>
    );
  }

  const selection = live?.selection ?? {};
  const money = bundleMoney({ purchase, total: live?.total ?? null });
  const prices: KitPrices = money.showPrices ? (live?.prices ?? {}) : {};

  return (
    <div className="mt-6 rounded-[12px] border border-border bg-surface-primary p-5">
      <h3 className="mb-4 text-sm font-semibold text-text-primary">Build your configuration</h3>
      <div className="space-y-5">
        {kit.groups.map((group) => (
          <KitGroupPicker
            key={group.name}
            group={group}
            prices={prices}
            selectedId={selection[group.name] ?? null}
            onSelect={(id) => live?.select(group.name, id)}
          />
        ))}
      </div>
      {money.configured != null ? (
        <div className="mt-4 border-t border-border pt-3">
          <p className="flex items-baseline justify-between text-sm">
            <span className="text-text-secondary">Price as configured</span>
            <Price amount={money.configured} gst className="font-semibold text-text-primary" />
          </p>
          {money.cartOffered && (
            <p className="mt-1 text-[13px] text-text-secondary">
              Each item is added to your cart as its own line, at its own price.
            </p>
          )}
        </div>
      ) : (
        <p className="mt-4 text-[13px] text-text-secondary">
          Configurations like this are priced by our team. Your choices are sent through with the
          quote request.
        </p>
      )}
    </div>
  );
}

function KitGroupPicker({
  group,
  prices,
  selectedId,
  onSelect,
}: {
  group: KitGroup;
  prices: KitPrices;
  selectedId: number | null;
  onSelect: (productId: number | null) => void;
}) {
  const priceOf = (productId: number, quantity: number) =>
    prices[productId] != null ? prices[productId] * quantity : null;

  // A required group of one product is a part of the bundle, not a question.
  if (isFixedGroup(group)) {
    const item = group.items[0];
    const amount = priceOf(item.productId, item.quantity);
    return (
      <div>
        <p className="mb-2 text-sm font-medium text-text-primary">{group.name}</p>
        <div className="flex items-center gap-3 rounded-[10px] border border-border bg-white px-3 py-2 text-sm">
          <Package className="h-4 w-4 shrink-0 text-accent" strokeWidth={1.7} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-text-primary">
              {item.quantity > 1 && <span className="font-medium">{item.quantity} × </span>}
              {item.name}
            </span>
            {item.sku && <span className="block truncate spec-mono">{item.sku}</span>}
          </span>
          <span className="shrink-0 text-[13px] text-text-secondary">Included</span>
          {amount != null && <Price amount={amount} gst className="shrink-0 text-sm text-text-primary" />}
        </div>
      </div>
    );
  }

  const row = (active: boolean) =>
    `flex cursor-pointer items-center gap-3 rounded-[10px] border bg-white px-3 py-2 text-sm transition-colors ${
      active ? "border-brand" : "border-border hover:border-border-strong"
    }`;

  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-text-primary">
        {group.name}
        {group.optional && <span className="ml-1 text-[13px] font-normal text-text-secondary">(optional)</span>}
      </legend>
      <div className="space-y-2">
        {group.optional && (
          <label className={row(selectedId == null)}>
            <input
              type="radio"
              name={`kit-${group.name}`}
              checked={selectedId == null}
              onChange={() => onSelect(null)}
              className="h-4 w-4 border-border-strong text-brand focus:ring-brand"
            />
            <span className="min-w-0 flex-1 text-text-primary">None</span>
          </label>
        )}
        {group.items.map((item) => {
          const amount = priceOf(item.productId, item.quantity);
          return (
            <label key={item.productId} className={row(selectedId === item.productId)}>
              <input
                type="radio"
                name={`kit-${group.name}`}
                value={item.productId}
                checked={selectedId === item.productId}
                onChange={() => onSelect(item.productId)}
                className="h-4 w-4 border-border-strong text-brand focus:ring-brand"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-text-primary">
                  {item.quantity > 1 && <span className="font-medium">{item.quantity} × </span>}
                  {item.name}
                </span>
                {item.sku && <span className="block truncate spec-mono">{item.sku}</span>}
              </span>
              {amount != null && (
                <span className="shrink-0 text-sm text-text-primary">
                  + <Price amount={amount} gst />
                </span>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
