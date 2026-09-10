// ============================================================================
// WHICH EXTRAS GROUPS DOES THE "Optional extras" PANEL DRAW? (cards 0CDcCYmO / KvLJOAON)
//
// `products.metafields.addons` is ONE bag holding two different features:
//
//   checkbox / radio / dropdown   paid add-on extras — this panel's (0CDcCYmO)
//   text                          a free-text customisation box — kyMjCmAw's
//
// They landed together and share the bag deliberately (one definition, one resolver, one
// stored shape, one line note), but they are NOT one control. kyMjCmAw's box has its own
// panel, its own wording and its own gating; drawn by this panel it came out as an empty
// bordered radio list carrying a "Choose one" label that could never be satisfied — a
// disabled control with nothing on screen explaining it, which is what `sf-product-page`
// forbids (7vu2iEEZ x CXnP1lrL).
//
// So the split is declared HERE, once, rather than as a filter buried in the component:
// whoever adds a control type has to say which panel owns it.
//
// WHETHER the panel is on screen at all is a different question and is NOT asked here — it
// is `addonPanelShown` in `@keenan/services/product-addons`, read off the provider as
// `addonGroupsOffered`, so the panel, the buy buttons and both buy ACTIONS share one answer.
// ============================================================================

import type { ProductAddonGroup, ProductAddons } from "@keenan/services/product-addons";

/** The groups the paid-extras panel draws. Text customisation groups belong to kyMjCmAw. */
export function extrasPanelGroups(addons: ProductAddons | null | undefined): ProductAddonGroup[] {
  if (!addons) return [];
  return addons.groups.filter((g) => g.control !== "text");
}

/**
 * The groups the FREE-TEXT customisation panel draws — kyMjCmAw's half of the same bag.
 * Declared here beside `extrasPanelGroups` so the split lives in ONE place and whoever adds
 * a control type has to say which panel owns it.
 */
export function customisationGroups(
  addons: ProductAddons | null | undefined
): ProductAddonGroup[] {
  if (!addons) return [];
  return addons.groups.filter((g) => g.control === "text");
}

/**
 * DOES THIS PRODUCT ASK FOR A TYPED ANSWER, whatever its price?
 *
 * The priced-extras panel hides itself on a product whose price is hidden or zero
 * (`addonPanelShown` in `@keenan/services/product-addons`), and its reasons are entirely
 * about money: a surcharge would republish a price staff suppressed, or price a quote-only
 * machine at its accessories alone. NEITHER reason reaches a `text` group — every text answer
 * resolves at 0.00 and moves nothing — and applying the price rule to it would have made this
 * feature unreachable on the one product it was built for: Custom Stainless Steel is quote-only
 * at $0.0000, which is exactly the shape `addonPanelShown` refuses.
 *
 * So the free-text panel has its own gating, as `extrasPanelGroups` above says it does. This
 * is that gate, and it is the same answer the panel renderers, both buy buttons and both buy
 * ACTIONS read, so no two of them can disagree about whether a press should carry an answer.
 */
export function customisationOffered(addons: ProductAddons | null | undefined): boolean {
  return customisationGroups(addons).length > 0;
}

/**
 * The definition a BUY is enforced against, server-side and in the provider.
 *
 * Re-exported from `@keenan/services/product-addons` rather than re-implemented: the storefront,
 * the shared purchase provider and both buy ACTIONS have to agree about this by construction, and
 * this file is the place a storefront author looks for the split. Priced groups only when their
 * panel is on screen; free-text groups always. See the services module for why.
 */
export { buyableAddons } from "@keenan/services/product-addons";

/**
 * The same two halves in the `ProductAddons | null` shape `resolveAddonSelection` and
 * `unansweredAddonGroups` take, so a refusal can be made over ONE half at a time and the
 * wording can fit the control that is missing an answer.
 */
export function extrasDefinition(
  addons: ProductAddons | null | undefined,
  pricedPanelShown: boolean
): ProductAddons | null {
  if (!addons || !pricedPanelShown) return null;
  const groups = extrasPanelGroups(addons);
  return groups.length > 0 ? { groups } : null;
}

export function customisationDefinition(
  addons: ProductAddons | null | undefined
): ProductAddons | null {
  const groups = customisationGroups(addons);
  return groups.length > 0 ? { groups } : null;
}

/**
 * SHOULD A BUY CONTROL ON THIS PAGE POST THE SHOPPER'S CONFIGURATION?
 *
 * `addonGroupsOffered` answers it for the priced extras: their panel hides itself with the
 * price, and a control that posts `{}` from a page with no tick boxes is refused over a
 * question the shopper was never asked (0CDcCYmO). The free-text groups answer it for
 * themselves, because their panel does not hide with the price.
 *
 * ONE call, read by every renderer that draws a buy control — the coded buy box, the CD v2
 * widgets and the node natives — so no two of them can disagree about whether a press carries
 * what the shopper typed. `undefined` (never `{}`) is still what a renderer with no panel
 * posts, which is what keeps a listing tile from clearing a configuration made elsewhere.
 */
export function postsConfiguration(
  addonGroupsOffered: boolean,
  addons: ProductAddons | null | undefined
): boolean {
  return addonGroupsOffered || customisationOffered(addons);
}
