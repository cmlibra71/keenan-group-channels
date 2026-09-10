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
