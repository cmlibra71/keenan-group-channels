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
// GROUP RULES (Zoey bundles, IK 2026-09-28): an "included" group is listed, not chosen; an
// optional pick-one offers "None"; a "many" group is tick boxes. A rule-less group is today's
// required pick-one radio list.
// ============================================================================

import { Package } from "lucide-react";
import type { KitGroup, KitSelection, ProductKit } from "@/lib/product-kit";

export function ProductKitBlock({
  kit,
  selection,
  onSelect,
}: {
  kit: ProductKit;
  /** Bundle only: chosen product ids per group name. */
  selection: KitSelection;
  /** `null` is the None answer of an optional pick-one group. */
  onSelect: (group: string, productId: number | null) => void;
}) {
  if (kit.kind === "grouped") {
    return (
      <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-5">
        <h3 className="mb-3 text-sm font-semibold text-zinc-900">What&apos;s included</h3>
        <ul className="space-y-2">
          {kit.items.map((item) => (
            <li key={item.productId} className="flex items-start gap-2 text-sm text-zinc-700">
              <Package className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
              <span>
                <span className="font-medium text-zinc-900">{item.quantity} ×</span> {item.name}
                {item.sku && <span className="ml-1 text-xs text-zinc-500">({item.sku})</span>}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-zinc-500">
          Sold together for one price — everything above arrives as a single kit.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-5">
      <h3 className="mb-4 text-sm font-semibold text-zinc-900">Build your configuration</h3>
      <div className="space-y-5">
        {kit.groups.map((group) => (
          <KitGroupPicker
            key={group.name}
            group={group}
            selectedIds={selection[group.name] ?? []}
            onSelect={onSelect}
          />
        ))}
      </div>
      <p className="mt-4 text-xs text-zinc-500">
        Configurations like this are priced by our team. Your choices are sent through with the
        quote request.
      </p>
    </div>
  );
}

function KitGroupPicker({
  group,
  selectedIds,
  onSelect,
}: {
  group: KitGroup;
  selectedIds: number[];
  onSelect: (group: string, productId: number | null) => void;
}) {
  if (group.mode === "included") {
    return (
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-zinc-900">{group.name}</legend>
        <ul className="space-y-1">
          {group.items.map((item) => (
            <li key={item.productId} className="flex items-start gap-2 text-sm text-zinc-700">
              <Package className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
              <span>
                <span className="font-medium text-zinc-900">{item.quantity} ×</span> {item.name}
                {item.sku && <span className="ml-1 text-xs text-zinc-500">({item.sku})</span>}
              </span>
            </li>
          ))}
        </ul>
      </fieldset>
    );
  }
  const many = group.mode === "many";
  const offerNone = !many && !group.required;
  const rowClass = (on: boolean) =>
    `flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors ${
      on ? "border-zinc-900 bg-white" : "border-zinc-200 bg-white hover:border-zinc-400"
    }`;
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-zinc-900">
        {group.name}
        {group.required && <span className="ml-1 text-xs font-normal text-zinc-500">(required)</span>}
      </legend>
      <div className="space-y-2">
        {offerNone && (
          <label className={rowClass(selectedIds.length === 0)}>
            <input
              type="radio"
              name={`kit-${group.name}`}
              value=""
              checked={selectedIds.length === 0}
              onChange={() => onSelect(group.name, null)}
              className="h-4 w-4 border-zinc-300 text-zinc-900 focus:ring-zinc-500"
            />
            <span className="min-w-0 flex-1 text-zinc-900">None</span>
          </label>
        )}
        {group.items.map((item) => {
          const on = selectedIds.includes(item.productId);
          return (
            <label key={item.productId} className={rowClass(on)}>
              <input
                type={many ? "checkbox" : "radio"}
                name={`kit-${group.name}`}
                value={item.productId}
                checked={on}
                onChange={() => onSelect(group.name, item.productId)}
                className={`h-4 w-4 border-zinc-300 text-zinc-900 focus:ring-zinc-500${many ? " rounded" : ""}`}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-zinc-900">
                  {item.quantity > 1 ? `${item.quantity} × ` : ""}
                  {item.name}
                </span>
                {item.sku && <span className="block truncate text-xs text-zinc-500">{item.sku}</span>}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
