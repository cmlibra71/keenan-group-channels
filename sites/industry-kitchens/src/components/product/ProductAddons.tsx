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
// amount on this page, and follow the storewide ex/inc-GST switch exactly as
// the headline does — through <Price gst> everywhere except inside a <select>,
// which can hold no markup and so reads the same toggle through
// `useAddonMoney`. Nothing here works a price out: the sum the shopper reads is
// `purchase.addonTotal`, the same figure the buy buttons send and the cart
// re-derives server-side.
//
// THE PICKS TRAVEL WITH EITHER BUTTON. The panel sits above Add to Cart AND Add
// to Quote, so both carry the ticked extras — the cart charges them, the quote
// records them for the rep to price (`sf-product-page`, 7bmpuqei's "the
// customer's picks travel with whatever button they press").
// ============================================================================

import { useProductPurchase } from "@keenan/services/product-page";
import type { ProductAddonGroup } from "@keenan/services/product-addons";
import { Price } from "@/components/ui/Price";
import { extrasPanelGroups, optionalRadioNoneRow, questionGroups, quoteExtrasGroups } from "@/lib/product/addon-panel";
import { useGst, adjustForGst } from "@/lib/gst";

/** "245.00" ex GST, or "269.50" once the storewide toggle says inclusive.
 *
 *  A `<select><option>` can hold no markup, so the one price on this page that cannot go
 *  through <Price gst> is the dropdown's. It reads the SAME toggle here instead — a hardcoded
 *  `$` on the raw string put $245.00 in the list and $269.50 in the total three lines below it.
 */
function useAddonMoney(): (price: string) => string {
  const { inclusive, pricesIncludeTax } = useGst();
  return (price: string) =>
    adjustForGst(Number(price), inclusive, pricesIncludeTax).toLocaleString("en-AU", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
}

/** The option's own product page, in a new tab. Shared by every control, because the matrix
 *  asks for the link and the control the author picked must not decide whether they get one. */
function OptionLink({ url, className }: { url: string; className?: string }) {
  return (
    // Tim's matrix asks for the option's own product page, opened in a NEW TAB — the shopper is
    // mid-configuration and must not lose their picks to a navigation. rel="noopener noreferrer"
    // because target="_blank" otherwise hands the opened page a live handle on this one. The link
    // is a same-site path: @keenan/services/product-addons refuses anything else.
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={className ?? "text-xs text-text-secondary underline underline-offset-2 hover:text-text-primary"}
      onClick={(e) => e.stopPropagation()}
    >
      View details
      <span aria-hidden="true"> &#8599;</span>
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/** "Slicer 4mm  + $245.00", with the link when the extra has its own page. */
function OptionLabel({
  label,
  price,
  url,
  priced = true,
  hideZero = false,
}: {
  label: string;
  price: string;
  url: string | null;
  /** See `ProductAddons`' `zoeyGroups`: print nothing beside a $0 answer. */
  hideZero?: boolean;
  /** False on a no-charge QUESTION (Gas Type, card tkvntxsq): no "+ $0.00" beside an answer
   *  that never moves the price — Zoey prints nothing there either. */
  priced?: boolean;
}) {
  return (
    <span className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
      <span className="min-w-0 text-sm text-text-primary">
        {label}
        {url ? (
          <>
            {" "}
            <OptionLink url={url} />
          </>
        ) : null}
      </span>
      {/* No "+ $0.00" beside a $0 answer ("Brisbane, Sydney, Melbourne, Adelaide - $0"): Zoey prints
          nothing there, and the label usually says "$0" already (IK re-audit 39568 / 45223). Only
          where the site asks (`zoeyGroups`). */}
      {priced && !(hideZero && !(Number(price) > 0)) ? (
        <span className="shrink-0 text-sm font-semibold text-text-primary">
          + <Price amount={Number(price)} gst />
        </span>
      ) : null}
    </span>
  );
}

function AddonGroup({
  group,
  chosen,
  onToggle,
  priced = true,
  first = false,
  optionalRadioNone = false,
  bareNoCharge = false,
  hideZero = false,
  labels = {},
}: {
  group: ProductAddonGroup;
  chosen: string[];
  onToggle: (optionKey: string, on?: boolean) => void;
  /** False for a no-charge question — its answers carry no price to print. */
  priced?: boolean;
  /** Print nothing beside a declared no-charge answer in a priced group ("Other - call for freight
   *  quote POA", as Zoey prints it) — the quote-extras box only, so the priced panel is unchanged. */
  bareNoCharge?: boolean;
  /** The first group in a box with no heading above it sits flush with the box's padding. */
  first?: boolean;
  /** See `ProductAddons`' prop of the same name. */
  optionalRadioNone?: boolean;
  /** See `ProductAddons`' `zoeyGroups`. */
  hideZero?: boolean;
  /** See `AddonLabels`. */
  labels?: AddonLabels;
}) {
  const single = group.control !== "checkbox";
  // Zoey's "None" answer on an OPTIONAL radio group — see `optionalRadioNoneRow`.
  const noneRow = optionalRadioNoneRow(group, chosen, optionalRadioNone);
  const unanswered = single && group.required && chosen.length === 0;
  const money = useAddonMoney();
  // A <select> can hold no anchor, so a dropdown group's link is rendered UNDER the list, for
  // the choice currently held. Without this a group the author set to Dropdown offered no link
  // at all, and the matrix asks for the link and the three controls as one row.
  const chosenOption = single ? group.options.find((o) => o.key === chosen[0]) ?? null : null;

  return (
    <fieldset className={first ? "" : "mt-4"}>
      <legend className="text-sm font-semibold text-text-primary">
        {group.required && word(labels.required_marker, "") ? <em className="mr-0.5 not-italic text-red-700">{word(labels.required_marker, "")}</em> : null}
        {group.label}
        {/* The button greys while a required group is unanswered (the provider folds
            it into allOptionsSelected), so the reason has to be ON THE SCREEN — a
            disabled control with no wording next to it is exactly what
            sf-product-page forbids. */}
        {group.required && single && (unanswered ? word(labels.required_message, word(labels.choose_one, "Choose one")) : word(labels.choose_one, "Choose one")) ? (
          <span
            className={`ml-2 text-xs font-normal ${
              unanswered ? "text-red-700" : "text-text-muted"
            }`}
          >
            {unanswered ? word(labels.required_message, word(labels.choose_one, "Choose one")) : word(labels.choose_one, "Choose one")}
          </span>
        ) : null}
        {/* A required TICK-BOX group (Zoey's required "multiple", e.g. Hallde "Free Discs
            Inlude"): marked as required; the provider keeps the last tick once one is ticked.
            A group with no pre-ticked answer is marked but not enforced (known limitation). */}
        {!single && (group as { atLeastOne?: true }).atLeastOne === true && word(labels.choose_many, "Choose at least one") ? (
          <span className="ml-2 text-xs font-normal text-text-muted">{word(labels.choose_many, "Choose at least one")}</span>
        ) : null}
      </legend>

      {group.control === "dropdown" ? (
        <>
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
          <option value="">{group.required ? word(labels.placeholder_required, "Please choose…") : word(labels.placeholder_optional, "None")}</option>
          {group.options.map((o) => (
            <option key={o.key} value={o.key}>
              {priced && !(bareNoCharge && o.noCharge) && !(hideZero && !(Number(o.price) > 0)) ? `${o.label} (+$${money(o.price)})` : o.label}
            </option>
          ))}
        </select>
        {chosenOption?.url ? (
          <p className="mt-1.5">
            <OptionLink url={chosenOption.url} />
          </p>
        ) : null}
        </>
      ) : (
        <div className="mt-2 divide-y divide-border rounded-md border border-border">
          {noneRow.shown ? (
            <label className="flex cursor-pointer items-start gap-3 px-3 py-2 hover:bg-surface-secondary">
              <input
                type="radio"
                name={`addon-${group.key}`}
                checked={noneRow.checked}
                onChange={() => {
                  // `on: false` on the held answer: toggleAddon needs a real option key to find
                  // the group's row, exactly as the dropdown's own "None" does.
                  if (chosen[0]) onToggle(chosen[0], false);
                }}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-brand,#000)]"
              />
              <span className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <span className="min-w-0 text-sm text-text-primary">{word(labels.none_label, "None")}</span>
              </span>
            </label>
          ) : null}
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
                <OptionLabel label={o.label} price={o.price} url={o.url} priced={priced && !(bareNoCharge && o.noCharge)} hideZero={hideZero} />
              </label>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}

/**
 * The extras panel's wording, from the template node's props (CMS data). Unset = today's words;
 * "" = draw nothing. `required_message` is shown only while a required pick-one group is unanswered
 * (the reason the buy button greys — sf-product-page forbids a disabled control with no reason).
 */
export interface AddonLabels {
  choose_one?: string | null;
  required_message?: string | null;
  choose_many?: string | null;
  required_marker?: string | null;
  placeholder_required?: string | null;
  placeholder_optional?: string | null;
  none_label?: string | null;
  optional_heading?: string | null;
  optional_hint?: string | null;
  extras_total?: string | null;
}
const word = (v: string | null | undefined, fallback: string) => (typeof v === "string" ? v : fallback);

export function ProductAddons({
  optionalRadioNone = false,
  zoeyGroups = false,
  labels = {},
}: {
  /** See `AddonLabels`. */
  labels?: AddonLabels;
  /**
   * Draw Zoey's "None" answer at the top of every OPTIONAL radio group, ticked while nothing
   * else is (IK parity: Hatco GRAH "Optional Controller" reads None / Built-in Control Unit /
   * Remote Control on Zoey). Off by default, so a site that does not ask for it is unchanged.
   */
  optionalRadioNone?: boolean;
  /**
   * Zoey's way of asking priced groups (IK parity re-audit): a REQUIRED priced group is asked
   * first, outside the "Optional extras" heading (the heading is drawn only over optional groups),
   * and a $0 answer prints no "+ $0.00". Off by default, so a site that does not ask is unchanged.
   */
  zoeyGroups?: boolean;
}) {
  const purchase = useProductPurchase();
  const addons = purchase.product.addons ?? null;
  if (!addons) return null;

  /**
   * THE QUESTIONS FIRST, AND WHATEVER THE PRICE (card tkvntxsq).
   *
   * A no-charge question — Gas Type, Natural Gas or LPG — decides WHICH machine is being bought,
   * so it is asked before any extra and it is asked on a quote-only or hidden-price product too:
   * the provider keeps it in `buyableAddons` whatever the price (it moves no money, so none of the
   * priced panel's reasons to hide reach it), which means a required one greys the buy controls
   * until it is answered — and this block is the "Choose one" on screen that explains why. Drawn
   * only while the provider OFFERS it (`addonGroupsOffered`), the same flag the buy controls post
   * on, so a renderer that asks cannot disagree with one that posts.
   *
   * No "Optional extras" heading and no "+ $0.00": a required question is not optional and moves
   * no price, and saying either over Gas Type told the shopper two untrue things.
   */
  const questions = purchase.addonGroupsOffered ? questionGroups(addons) : [];

  /**
   * IS THE PRICED PANEL ON SCREEN? Read from the provider, never re-derived here.
   *
   * `extrasPanelShown` IS the predicate (`@keenan/services/product-addons` `addonPanelShown`):
   * the product carries groups, its price is not hidden and it is not zero. Re-testing
   * `hidePrice` and the amounts here is what once let the panel and the buy controls disagree —
   * a required group went on greying "Add to Quote, request pricing" on a $0 quote-only product
   * whose panel this component had already declined to draw, a dead control with nothing
   * explaining it, which is the screen `sf-product-page` forbids (7vu2iEEZ x CXnP1lrL).
   *
   * NOT `addonGroupsOffered`, which is the WIDER question — "is there anything at all on this
   * page to configure" — and answers yes for a free-text Instructions box on a quote-only
   * product (card kyMjCmAw). Reading that one here drew "+ $245.00" tick boxes beside a
   * "Contact For Price" panel on a $0 machine, republishing a total the page may not publish.
   * Two questions, two flags.
   *
   * WHICH groups are ours is declared in `lib/product/addon-panel.ts`, not filtered inline, so
   * whoever adds a control type has to say which panel owns it. A `text` group is kyMjCmAw's
   * free-text customisation box, and a no-charge question is drawn above.
   */
  const groups = purchase.extrasPanelShown ? extrasPanelGroups(addons) : [];
  /**
   * ZOEY'S OWN OPTIONS ON A PRODUCT WITH NO PRICE (IK parity, XLV-5214). Zoey asks "Freight —
   * Melbourne Metro +$575.00 …" on a POA canopy, and the answer rides the quote. The provider keeps
   * them buyable and says so (`quoteExtrasShown`); they are drawn in the questions' box — each
   * option priced, as Zoey prints it, but no "Optional extras" heading and no running total,
   * because there is no product price for anything to add up to.
   */
  const quoteExtras = purchase.quoteExtrasShown ? quoteExtrasGroups(addons) : [];
  const requiredGroups = zoeyGroups ? groups.filter((g) => g.required) : [];
  const optionalGroups = zoeyGroups ? groups.filter((g) => !g.required) : groups;
  if (questions.length === 0 && groups.length === 0 && quoteExtras.length === 0) return null;

  return (
    <>
      {questions.length > 0 ? (
        <div
          className="mt-5 rounded-[12px] border border-border bg-surface-primary px-4 py-3"
          data-product-questions=""
        >
          {questions.map((group, i) => (
            <AddonGroup
              key={group.key}
              group={group}
              priced={false}
              first={i === 0}
              optionalRadioNone={optionalRadioNone}
              hideZero={zoeyGroups}
              labels={labels}
              chosen={purchase.selectedAddons[group.key] ?? []}
              onToggle={(optionKey, on) => purchase.toggleAddon(group.key, optionKey, on)}
            />
          ))}
        </div>
      ) : null}

      {quoteExtras.length > 0 ? (
        <div
          className="mt-5 rounded-[12px] border border-border bg-surface-primary px-4 py-3"
          data-product-quote-extras=""
        >
          {quoteExtras.map((group, i) => (
            <AddonGroup
              key={group.key}
              group={group}
              first={i === 0}
              optionalRadioNone={optionalRadioNone}
              hideZero={zoeyGroups}
              labels={labels}
              bareNoCharge
              chosen={purchase.selectedAddons[group.key] ?? []}
              onToggle={(optionKey, on) => purchase.toggleAddon(group.key, optionKey, on)}
            />
          ))}
        </div>
      ) : null}

      {groups.length > 0 ? (
        <div className="mt-5 rounded-[12px] border border-border bg-surface-primary px-4 py-3">
          {/* A REQUIRED priced group (the SKOPE interstate transfer, a required Colour) is not an
              optional extra: Zoey asks it with its own required marker and no "Optional extras"
              heading (IK re-audit 53075 / 36791 / 10299). Asked first; the heading heads only the
              optional ones, and is not drawn when there are none. */}
          {requiredGroups.map((group, i) => (
            <AddonGroup
              key={group.key}
              group={group}
              first={i === 0}
              optionalRadioNone={optionalRadioNone}
              hideZero={zoeyGroups}
              labels={labels}
              chosen={purchase.selectedAddons[group.key] ?? []}
              onToggle={(optionKey, on) => purchase.toggleAddon(group.key, optionKey, on)}
            />
          ))}
          {optionalGroups.length > 0 ? (
            <>
              {word(labels.optional_heading, "Optional extras") ? (
                <p className={`${requiredGroups.length > 0 ? "mt-4 " : ""}text-sm font-semibold text-text-primary`}>{word(labels.optional_heading, "Optional extras")}</p>
              ) : null}
              {word(labels.optional_hint, "Tick what you need — the price updates as you go.") ? (
                <p className="mt-0.5 text-xs text-text-secondary">{word(labels.optional_hint, "Tick what you need — the price updates as you go.")}</p>
              ) : null}
            </>
          ) : null}

          {optionalGroups.map((group) => (
            <AddonGroup
              key={group.key}
              group={group}
              optionalRadioNone={optionalRadioNone}
              hideZero={zoeyGroups}
              labels={labels}
              chosen={purchase.selectedAddons[group.key] ?? []}
              onToggle={(optionKey, on) => purchase.toggleAddon(group.key, optionKey, on)}
            />
          ))}

          {purchase.addonTotal > 0 && word(labels.extras_total, "Extras added") ? (
            <p className="mt-4 flex items-baseline justify-between border-t border-border pt-3 text-sm">
              <span className="text-text-secondary">{word(labels.extras_total, "Extras added")}</span>
              <span className="font-semibold text-text-primary">
                + <Price amount={purchase.addonTotal} gst />
              </span>
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
