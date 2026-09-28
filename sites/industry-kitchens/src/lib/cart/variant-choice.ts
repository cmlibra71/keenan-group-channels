// ============================================================================
// Which variant of a product is a CHOICE the shopper makes — the cart's answer, matched to the
// product page's (IK judge wave 1, 2026-09-28, two edges only a hand-posted add could reach).
//
// The product page (services `product-page/provider.tsx`) is in "pick a variation" mode exactly
// when the product has options AND variant→option mappings (`useGroupedMode`), and the variants a
// shopper can pick are the ones that carry a mapping. Everywhere else the page never selects a
// variant at all (nothing calls `setSelectedVariantId`), so it prices the PARENT row:
// `resolveCatalogPrice(product, null)`. The cart has to read the same two facts or it charges a
// price the page never showed:
//
//   1. A simple product's lone base variant is not a choice. It usually mirrors the parent's
//      list price with no sale of its own, so naming it priced the line from its OWN row and lost
//      the parent's sale: Robot Coupe 27382 charged $1,050.00 where the page shows $966.00, Baron
//      Q70NEC/410 $2,510.00 where it shows $1,899.00. `catalogPricingVariantId` hands the
//      catalogue resolver no variant in that case — the line is priced as the page prices it.
//
//   2. A configurable product added with no variation chosen was accepted at the parent's own
//      price (Durafurn Seattle at $54.00 with no Castors or Colour). The page disables its buy
//      buttons until every option is picked and names the missing ones ("Please choose Castors
//      and Colour …"); `unchosenOptionsRefusal` refuses the add with the same sentence.
//
// Pure (the loader is `loadVariantChoiceFacts` below, the only impure part), so the rules are
// unit-tested (`variant-choice.test.ts`). Listed in `orchestrator/shared-modules.json`: both
// storefronts share the one cart action.
// ============================================================================

import { getCommerceClient } from "@keenan/services";

export interface VariantChoiceFacts {
  /** The product's option names as the page labels them (`display_name`), in page order. */
  optionLabels: string[];
  /** The product's variants that carry at least one option mapping — the pickable choices. */
  choiceVariantIds: ReadonlySet<number>;
}

export const NO_VARIANT_CHOICES: VariantChoiceFacts = { optionLabels: [], choiceVariantIds: new Set() };

/** The page asks the shopper to pick a variation (the provider's `useGroupedMode`). */
export function isPickMode(facts: VariantChoiceFacts | null | undefined): boolean {
  return !!facts && facts.optionLabels.length > 0 && facts.choiceVariantIds.size > 0;
}

/**
 * The variant the CATALOGUE price is read from, or null to price the parent row — exactly the
 * variant the page prices: the chosen variation on a configurable, and none otherwise.
 */
export function catalogPricingVariantId(
  facts: VariantChoiceFacts | null | undefined,
  variantId: number | null | undefined
): number | null {
  if (!variantId) return null;
  return isPickMode(facts) && facts!.choiceVariantIds.has(variantId) ? variantId : null;
}

/**
 * The refusal for an add that names no variation (or one that is not a choice of this product)
 * on a configurable product, or null. The wording is the page's own (`missingAnswerSentence`,
 * the buy handler's `options-required` prompt): "Please choose X and Y before adding this to your
 * cart." A listing TILE posts no configuration at all, so its refusal names the product page and
 * carries it for the tile to open, like the extras refusal beside it.
 */
export function unchosenOptionsRefusal(
  facts: VariantChoiceFacts | null | undefined,
  variantId: number | null | undefined,
  opts: { posted: boolean; productPage?: string | null }
): { error: string; productPage?: string } | null {
  if (!isPickMode(facts)) return null;
  if (variantId && facts!.choiceVariantIds.has(variantId)) return null;
  const labels = facts!.optionLabels.join(" and ");
  if (opts.posted) return { error: `Please choose ${labels} before adding this to your cart.` };
  const error = `Open this product's page to choose ${labels} before adding it to your cart.`;
  return opts.productPage ? { error, productPage: opts.productPage } : { error };
}

/**
 * The option labels and pickable variants of one product — two small indexed reads. Never throws:
 * a failed read answers "not configurable", which leaves the cart exactly as it behaved before
 * (no refusal; a named variant priced from its own row, as `catalogLinePrices` always did).
 */
export async function loadVariantChoiceFacts(productId: number): Promise<VariantChoiceFacts | null> {
  if (!Number.isInteger(productId) || productId <= 0) return NO_VARIANT_CHOICES;
  try {
    const sql = getCommerceClient();
    if (!sql) return null;
    const [options, mapped] = await Promise.all([
      sql<{ label: string | null }[]>`
        SELECT COALESCE(NULLIF(display_name, ''), name) AS label
          FROM product_options
         WHERE product_id = ${productId}
         ORDER BY sort_order ASC NULLS LAST, id ASC`,
      sql<{ variant_id: number }[]>`
        SELECT DISTINCT pvo.variant_id
          FROM product_variant_options pvo
          JOIN product_variants v ON v.id = pvo.variant_id
         WHERE v.product_id = ${productId}`,
    ]);
    return {
      optionLabels: options.map((o) => (o.label ?? "").trim()).filter(Boolean),
      choiceVariantIds: new Set(mapped.map((m) => Number(m.variant_id))),
    };
  } catch {
    return null;
  }
}
