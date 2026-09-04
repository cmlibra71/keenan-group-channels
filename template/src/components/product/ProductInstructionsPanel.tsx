"use client";

// ============================================================================
// ProductInstructionsPanel — the FREE-TEXT customisation groups on a product
// page (card kyMjCmAw).
//
// The Zoey reference page (industrykitchens.com.au/custom-stainless-steel)
// shows one boxed panel titled "Instructions" with a required text field,
// sitting directly above Qty and ADD TO QUOTE. That is what this draws.
//
// IT IS NOT A PRICE. A `text` group carries no priced options and resolves to a
// $0.00 answer server-side, so nothing here moves money — the customer is
// telling us what to fabricate, and a rep prices it on review. What the field
// must NOT do is get lost: the typed text travels with whichever buy button is
// pressed, because it rides the same `selectedAddons` bag a ticked extra does
// (register rule 7bmpuqei on `sf-product-page`).
//
// CONTROLLED, WITH TWO HOSTS. The node-tree page binds it to the shared
// purchase provider (`setAddonText`); the legacy monolithic buy box binds it to
// its own state. One component either way, so the two renderers cannot end up
// showing different fields — the same arrangement `ProductKitBlock` already has.
// ============================================================================

import type { ProductAddonGroup } from "@keenan/services/product-addons";

export function ProductInstructionsPanel({
  groups,
  values,
  onChange,
  /** Groups the shopper has been asked for and not filled in — shown only after
   *  they press a buy button, so the page does not greet them with an error. */
  missingLabels = [],
}: {
  groups: ProductAddonGroup[];
  values: Record<string, string>;
  onChange: (groupKey: string, value: string) => void;
  missingLabels?: string[];
}) {
  const textGroups = groups.filter((g) => g.control === "text");
  if (textGroups.length === 0) return null;

  return (
    <div className="mt-6 space-y-4">
      {textGroups.map((group) => {
        const value = values[group.key] ?? "";
        // Whitespace is not an answer — the same test the server makes.
        const missing = missingLabels.includes(group.label) && value.trim() === "";
        const fieldId = `product-instructions-${group.key}`;
        const errorId = `${fieldId}-error`;
        const shared = {
          id: fieldId,
          name: fieldId,
          value,
          maxLength: group.maxLength,
          placeholder: group.placeholder ?? undefined,
          required: group.required,
          "aria-invalid": missing || undefined,
          "aria-describedby": missing ? errorId : undefined,
          onChange: (e: { target: { value: string } }) => onChange(group.key, e.target.value),
          className: `w-full rounded-lg border bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/20 ${
            missing ? "border-red-500" : "border-zinc-300"
          }`,
        };
        return (
          <div key={group.key} className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <label htmlFor={fieldId} className="mb-2 block text-sm font-semibold text-zinc-900">
              {group.label}
              {group.required && (
                <span className="ml-1 text-red-600" aria-hidden="true">
                  *
                </span>
              )}
            </label>
            {group.multiline ? (
              <textarea rows={4} {...shared} />
            ) : (
              <input type="text" {...shared} />
            )}
            {missing ? (
              <p id={errorId} className="mt-2 text-xs font-medium text-red-600">
                This is a required field.
              </p>
            ) : (
              <p className="mt-2 text-xs text-zinc-500">
                {group.required ? "Required — what" : "What"} you type here is sent through with your
                request so we can quote exactly what you need.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
