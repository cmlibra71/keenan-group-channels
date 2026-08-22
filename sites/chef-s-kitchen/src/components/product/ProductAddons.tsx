"use client";

// ============================================================================
// PAID ADD-ON EXTRAS on the product page — card 0CDcCYmO.
//
// Steve, 2026-08-11, answer 2: "Customers can tick those extras and update the
// price as they go." Maruin's signed-off test matrix names the four parts, on
// the Hallde RG-100 with its ~20 optional blades:
//
//     Options (Labeled as accessories / Slicers etc)
//     Options to be linked to products by live url in new TAB
//     Checkbox, radio, drop-down functionality
//     Prices linked to products (NOT currently available option in Zoey — NEW FEATURE)
//
// SEALED NATIVE, not an authored subtree, for the same reason the SilverChef
// panel is one: the picks drive the LIVE purchase state (the headline price,
// the weekly rent, what the cart is handed) and an authored tree cannot hold
// state or add money. Keyed `product-addons`; `builder/product-addons-node.ts`
// puts the leaf on both live trees at render time, so no template has to be
// re-authored and nothing is written to a stored tree.
//
// MONEY. Prices come from the provider already resolved against the product's
// own definition (@keenan/services/product-addons), ex GST like every other
// amount on this page, and are rendered through <Price gst> so a ticked extra
// follows the ex/inc GST switch exactly as the headline does. Nothing here
// works a price out — the sum the shopper reads is `purchase.addonTotal`, the
// same figure the buy buttons send and the cart re-derives server-side.
// ============================================================================

import { useProductPurchase } from "@keenan/services/product-page";
import type { ProductAddonGroup } from "@keenan/services/product-addons";
import { Price } from "@/components/ui/Price";

/** "Slicer 4mm  + $245.00", with the link when the extra has its own page. */
function OptionLabel({
  label,
  price,
  url,
}: {
  label: string;
  price: string;
  url: string | null;
}) {
  return (
    <span className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
      <span className="min-w-0 text-sm text-text-primary">
        {label}
        {url ? (
          <>
            {" "}
            {/* Tim's matrix asks for the option's own product page, opened in a NEW TAB —
                the shopper is mid-configuration and must not lose their picks to a
                navigation. rel="noopener noreferrer" because target="_blank" otherwise
                hands the opened page a live handle on this one. The link is a same-site
                path: @keenan/services/product-addons refuses anything else. */}
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-text-secondary underline underline-offset-2 hover:text-text-primary"
              onClick={(e) => e.stopPropagation()}
            >
              View details
              <span aria-hidden="true"> &#8599;</span>
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </>
        ) : null}
      </span>
      <span className="shrink-0 text-sm font-semibold text-text-primary">
        + <Price amount={Number(price)} gst />
      </span>
    </span>
  );
}

function AddonGroup({
  group,
  chosen,
  onToggle,
}: {
  group: ProductAddonGroup;
  chosen: string[];
  onToggle: (optionKey: string, on?: boolean) => void;
}) {
  const single = group.control !== "checkbox";
  const unanswered = single && group.required && chosen.length === 0;

  return (
    <fieldset className="mt-4">
      <legend className="text-sm font-semibold text-text-primary">
        {group.label}
        {/* The button greys while a required group is unanswered (the provider folds
            it into allOptionsSelected), so the reason has to be ON THE SCREEN — a
            disabled control with no wording next to it is exactly what
            sf-product-page forbids. */}
        {group.required && single ? (
          <span
            className={`ml-2 text-xs font-normal ${
              unanswered ? "text-red-700" : "text-text-muted"
            }`}
          >
            Choose one
          </span>
        ) : null}
      </legend>

      {group.control === "dropdown" ? (
        <select
          className="mt-2 w-full rounded-md border border-border bg-surface-primary px-3 py-2 text-sm text-text-primary"
          value={chosen[0] ?? ""}
          onChange={(e) => {
            const key = e.target.value;
            if (key === "") {
              // "None" — clear whatever was chosen. `on: false` on the held answer,
              // because toggleAddon needs a real option key to identify the group's row.
              if (chosen[0]) onToggle(chosen[0], false);
              return;
            }
            onToggle(key, true);
          }}
        >
          <option value="">{group.required ? "Please choose…" : "None"}</option>
          {group.options.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label} (+${o.price})
            </option>
          ))}
        </select>
      ) : (
        <div className="mt-2 divide-y divide-border rounded-md border border-border">
          {group.options.map((o) => {
            const isOn = chosen.includes(o.key);
            return (
              <label
                key={o.key}
                className="flex cursor-pointer items-start gap-3 px-3 py-2 hover:bg-surface-secondary"
              >
                <input
                  type={single ? "radio" : "checkbox"}
                  // A radio group needs a shared name or the browser treats every
                  // input as its own group and lets two be on at once.
                  name={single ? `addon-${group.key}` : undefined}
                  checked={isOn}
                  onChange={(e) => onToggle(o.key, single ? true : e.target.checked)}
                  // A radio never fires onChange when it is already checked, so
                  // un-picking an optional single choice has to ride the click.
                  onClick={single && isOn && !group.required ? () => onToggle(o.key, false) : undefined}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-brand,#000)]"
                />
                <OptionLabel label={o.label} price={o.price} url={o.url} />
              </label>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}

export function ProductAddons() {
  const purchase = useProductPurchase();
  const addons = purchase.product.addons ?? null;

  // Nothing to offer.
  if (!addons || addons.groups.length === 0) return null;
  // A product with no price of its own — or one staff set to Hide Price — sells by
  // quote, and the provider adds no surcharge in either case (it would republish a
  // suppressed price, or turn a quote-only machine into a cart line priced at its
  // accessories). Showing priced tick boxes that move no total would be a control
  // that does nothing, so the panel goes with the price.
  if (purchase.hidePrice || (purchase.displayBaseSalePrice ?? purchase.displayBasePrice) <= 0) {
    return null;
  }

  return (
    <div className="mt-5 rounded-[12px] border border-border bg-surface-primary px-4 py-3">
      <p className="text-sm font-semibold text-text-primary">Optional extras</p>
      <p className="mt-0.5 text-xs text-text-secondary">
        Tick what you need — the price updates as you go.
      </p>

      {addons.groups.map((group) => (
        <AddonGroup
          key={group.key}
          group={group}
          chosen={purchase.selectedAddons[group.key] ?? []}
          onToggle={(optionKey, on) => purchase.toggleAddon(group.key, optionKey, on)}
        />
      ))}

      {purchase.addonTotal > 0 ? (
        <p className="mt-4 flex items-baseline justify-between border-t border-border pt-3 text-sm">
          <span className="text-text-secondary">Extras added</span>
          <span className="font-semibold text-text-primary">
            + <Price amount={purchase.addonTotal} gst />
          </span>
        </p>
      ) : null}
    </div>
  );
}
