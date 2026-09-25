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

import {
  addonsAsOrderOptions,
  isNoChargeQuestion,
  readStoredAddons,
  type ProductAddonGroup,
  type ProductAddons,
  type ResolvedAddon,
} from "@keenan/services/product-addons";

/**
 * The groups the paid-extras panel draws. Text customisation groups belong to kyMjCmAw, and
 * no-charge QUESTIONS (Gas Type) to {@link questionGroups} — card tkvntxsq.
 */
export function extrasPanelGroups(addons: ProductAddons | null | undefined): ProductAddonGroup[] {
  if (!addons) return [];
  return addons.groups.filter((g) => g.control !== "text" && !isNoChargeQuestion(g));
}

/**
 * The QUESTIONS a product asks before it can be bought — a pick-one group whose every answer is a
 * declared no-charge answer, Gas Type (Natural Gas / LPG) being the one that matters (card
 * tkvntxsq). `isNoChargeQuestion` in `@keenan/services/product-addons` is the predicate.
 *
 * They are drawn by the same `ProductAddons` native as the priced extras, but NOT under the
 * "Optional extras — Tick what you need — the price updates as you go" heading and with no
 * "+ $0.00" beside each answer: a required question is not optional and moves no price, and
 * printing either sentence over Gas Type told the shopper two untrue things. They are also drawn
 * WHATEVER THE PRICE — the priced panel hides on a hidden or zero price for money reasons that do
 * not reach a question, and a quote-only gas range still has to ask it (`buyableAddons`).
 */
export function questionGroups(addons: ProductAddons | null | undefined): ProductAddonGroup[] {
  if (!addons) return [];
  return addons.groups.filter(isNoChargeQuestion);
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
  if (!addons) return null;
  // Everything the shopper CHOOSES (as opposed to types): the priced groups while their panel is
  // on screen, and the no-charge questions always (card tkvntxsq) — author order kept, because
  // the refusal names them in that order.
  const groups = addons.groups.filter(
    (g) => g.control !== "text" && (pricedPanelShown || isNoChargeQuestion(g))
  );
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

/**
 * THE SENTENCE A BUY CONTROL SAYS WHEN SOMETHING IS UNANSWERED, with the verb that fits the
 * control — you CHOOSE a hopper and you FILL IN an instruction.
 *
 * The node-tree page raises this as its own dialog (`BuilderProductPage.onOptionsRequired`)
 * rather than letting the server refusal come back, so this has to agree with what the two buy
 * ACTIONS would have said or the shopper meets two different sentences for one press. It splits
 * the same way and in the same order they do: the priced groups first, so 0CDcCYmO's wording is
 * unchanged on every product that carries one, and the free-text groups only when they are all
 * that is missing.
 *
 * Returns null when nothing is missing, so a caller can fall through to its own wording.
 */
export function missingAnswerSentence(
  addons: ProductAddons | null | undefined,
  missingLabels: readonly string[],
  destination: "cart" | "quote"
): string | null {
  const names = missingLabels.filter(Boolean);
  if (names.length === 0) return null;
  const typedLabels = new Set(customisationGroups(addons).map((g) => g.label));
  const chosen = names.filter((n) => !typedLabels.has(n));
  const typed = names.filter((n) => typedLabels.has(n));
  const where = destination === "cart" ? "cart" : "quote";
  if (chosen.length > 0) {
    return `Please choose ${chosen.join(" and ")} before adding this to your ${where}.`;
  }
  return `Please fill in ${typed.join(" and ")} before adding this to your ${where}.`;
}

/**
 * WHERE A LISTING TILE SENDS A SHOPPER WHOSE ADD NEEDS AN ANSWER (card tkvntxsq).
 *
 * A tile has no panel: its Add to Cart / Add to Quote posts no configuration, so on a product
 * that asks a REQUIRED question — Gas Type above all — both buy actions refuse it rather than
 * book a gas range with no gas type. Refusing is right; leaving the shopper on the category page
 * is not, because the AUTHORED tile the live category pages draw shows that refusal to nobody
 * (the `sf-catalog-browse` LIVE DEFECT). So the refusal also carries the product page, and the
 * tile takes the shopper there to choose. The add is still never made without an answer.
 *
 * `products.url_path` is data, so it is judged before it becomes a navigation: a plain path
 * segment only — no scheme, no `//` or `\` (a browser reads `/\evil.com` as `//evil.com`), no
 * query or fragment. Anything else gives no destination and the tile falls back to the words.
 */
export function productPageForRefusal(urlPath: unknown): string | null {
  if (typeof urlPath !== "string") return null;
  const s = urlPath.trim().replace(/^\/+/, "");
  if (!s || s.length > 500) return null;
  if (/[\\:?#]|\/\/|\s/.test(s)) return null;
  return `/products/${s}`;
}

/**
 * The page a refused TILE add should open, read off the buy action's result — or null to stay
 * put and show the words. Only ever a `/products/…` path the action built with
 * {@link productPageForRefusal}; anything else in the result is ignored, so a tile can never be
 * steered off the product namespace by what an action returned.
 */
export function tileRefusalDestination(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const page = (result as { productPage?: unknown }).productPage;
  return typeof page === "string" && page.startsWith("/products/") && productPageForRefusal(page.slice(10)) === page
    ? page
    : null;
}

/**
 * A quote line's picks, read off `quote_items.attributes.addon_selection` — where `addToQuote`
 * records them structurally. `attributes` is jsonb and may arrive double-encoded as a string, so
 * it is decoded defensively, the same read the portal's `readLineAddonSelection` makes.
 */
export function quoteLinePicks(attributes: unknown): ResolvedAddon[] {
  let source = attributes;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      source = null;
    }
  }
  const bag =
    source && typeof source === "object" && !Array.isArray(source)
      ? (source as Record<string, unknown>)
      : {};
  return readStoredAddons(bag.addon_selection);
}

/**
 * The picks as the "Group: answer" lines an email goods list prints under the product
 * ("Gas Type: LPG" — card tkvntxsq). Built from the SAME `addonsAsOrderOptions` bag the order
 * line stores, so the email and the order line it describes can never say different things. No
 * money in them, by construction.
 */
export function chosenOptionLines(picks: readonly ResolvedAddon[]): string[] {
  return Object.entries(addonsAsOrderOptions(picks)).map(([group, answer]) => `${group}: ${answer}`);
}
