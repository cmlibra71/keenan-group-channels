"use client";

// ============================================================================
// ProductKitBlock — what a GROUPED or BUNDLE product shows on its page.
//
// GROUPED: "What's included" — the fixed contents, for information. The kit is bought at its own
// single price and goes through as ONE line, so the normal buy buttons apply unchanged.
//
// BUNDLE: the choice groups the customer picks from. A modular configuration is deliberately NOT
// priced live (Steve, card 7bmpuqei) — the picks are captured and sent through as a quote request,
// so this block owns the selection and the parent hands it to Add to Quote.
//
// Chefs Depot copy of the template component, restyled onto the design system tokens.
// ============================================================================

import { Package } from "lucide-react";
import type { KitGroup, ProductKit } from "@/lib/product-kit";

export function ProductKitBlock({
  kit,
  selection,
  onSelect,
}: {
  kit: ProductKit;
  /** Bundle only: chosen product id per group name. */
  selection: Record<string, number>;
  onSelect: (group: string, productId: number) => void;
}) {
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

  return (
    <div className="mt-6 rounded-[12px] border border-border bg-surface-primary p-5">
      <h3 className="mb-4 text-sm font-semibold text-text-primary">Build your configuration</h3>
      <div className="space-y-5">
        {kit.groups.map((group) => (
          <KitGroupPicker
            key={group.name}
            group={group}
            selectedId={selection[group.name] ?? null}
            onSelect={onSelect}
          />
        ))}
      </div>
      <p className="mt-4 text-[13px] text-text-secondary">
        Configurations like this are priced by our team. Your choices are sent through with the
        quote request.
      </p>
    </div>
  );
}

function KitGroupPicker({
  group,
  selectedId,
  onSelect,
}: {
  group: KitGroup;
  selectedId: number | null;
  onSelect: (group: string, productId: number) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-text-primary">{group.name}</legend>
      <div className="space-y-2">
        {group.items.map((item) => (
          <label
            key={item.productId}
            className={`flex cursor-pointer items-center gap-3 rounded-[10px] border bg-white px-3 py-2 text-sm transition-colors ${
              selectedId === item.productId
                ? "border-brand"
                : "border-border hover:border-border-strong"
            }`}
          >
            <input
              type="radio"
              name={`kit-${group.name}`}
              value={item.productId}
              checked={selectedId === item.productId}
              onChange={() => onSelect(group.name, item.productId)}
              className="h-4 w-4 border-border-strong text-brand focus:ring-brand"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-text-primary">{item.name}</span>
              {item.sku && <span className="block truncate spec-mono">{item.sku}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
