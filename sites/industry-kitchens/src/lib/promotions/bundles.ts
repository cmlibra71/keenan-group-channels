// ============================================================================
// FIXED BUNDLES — a named list of SKUs and quantities at a percentage off the
// component prices (card p6YVxc4P, requirement 3).
//
// A bundle is a PROMOTION, not a kit SKU, and that is a reporting decision the
// card makes for us: "a bundle sold must write its component SKUs as order lines
// with their own quantities and prices. If a bundle becomes a single kit SKU,
// carton and chemical volumes vanish from every SKU and supplier report we run."
// So "Add the bundle" adds its components to the cart or the quote, and the
// shared engine discounts them once they are all there.
//
// That also means no row is written to `products` for a bundle — which is just as
// well, because the catalogue is Zoey-owned and the nightly ingest would fight
// anything we invented there.
// ============================================================================

import { loadBundlePromotions, parseOfferRule, type FixedBundleRule } from "@keenan/services";
import { productService, CHANNEL_ID } from "@/lib/store";

export type BundleComponentView = {
  sku: string;
  quantity: number;
  productId: number | null;
  variantId: number | null;
  name: string;
  /** The per-unit price this storefront charges, ex GST, or null when unknown. */
  unitPrice: number | null;
  slug: string | null;
  /** True when the SKU is not in this storefront's catalogue at all. */
  missing: boolean;
};

export type BundleView = {
  promotionId: number;
  promotionName: string;
  slug: string;
  headline: string;
  description: string | null;
  percent: number;
  components: BundleComponentView[];
  /** Σ component price × quantity, ex GST. */
  componentTotal: number;
  /** What the bundle costs after the percentage, ex GST — INDICATIVE. */
  bundleTotal: number;
  /** componentTotal − bundleTotal. */
  saving: number;
  /** False when a component is missing from the catalogue: the bundle cannot be added. */
  addable: boolean;
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** One live bundle, resolved against this storefront's catalogue. Null if unknown. */
export async function loadBundle(slug: string): Promise<BundleView | null> {
  const wanted = (slug ?? "").trim().toLowerCase();
  if (!wanted) return null;

  const promotions = await loadBundlePromotions(CHANNEL_ID).catch(() => []);
  for (const promotion of promotions) {
    const rule = parseOfferRule(promotion.rules);
    if (!rule || rule.type !== "fixed_bundle" || rule.slug !== wanted) continue;
    return await resolveBundle(promotion.id, promotion.name, rule);
  }
  return null;
}

/** Every live bundle on this storefront, for the index page. */
export async function loadBundles(): Promise<BundleView[]> {
  const promotions = await loadBundlePromotions(CHANNEL_ID).catch(() => []);
  const out: BundleView[] = [];
  for (const promotion of promotions) {
    const rule = parseOfferRule(promotion.rules);
    if (!rule || rule.type !== "fixed_bundle") continue;
    out.push(await resolveBundle(promotion.id, promotion.name, rule));
  }
  return out;
}

async function resolveBundle(
  promotionId: number,
  promotionName: string,
  rule: FixedBundleRule
): Promise<BundleView> {
  const components: BundleComponentView[] = [];
  let componentTotal = 0;

  for (const component of rule.components) {
    let row:
      | { id: number; name: string; price: string | null; sale_price: string | null; url_path: string | null }
      | undefined;
    try {
      const found = await productService.list({
        page: 1,
        limit: 1,
        sort: "id",
        direction: "asc",
        filters: { sku: { type: "eq", value: component.sku } },
      });
      row = found.data[0] as typeof row;
    } catch {
      row = undefined;
    }

    // The price a shopper sees on the product page: the channel's sale price when
    // there is one, otherwise RRP. Account contract prices and member pricing are
    // deliberately NOT resolved here — this page is read by signed-out shoppers too,
    // and the CART is where the real price is decided for THAT shopper. The page
    // says so.
    const unit = row
      ? row.sale_price && Number.isFinite(parseFloat(row.sale_price))
        ? parseFloat(row.sale_price)
        : row.price && Number.isFinite(parseFloat(row.price))
          ? parseFloat(row.price)
          : null
      : null;

    if (unit != null) componentTotal += unit * component.quantity;

    components.push({
      sku: component.sku,
      quantity: component.quantity,
      productId: row?.id ?? null,
      variantId: null,
      name: row?.name ?? component.sku,
      unitPrice: unit,
      slug: row?.url_path ?? null,
      missing: !row,
    });
  }

  const bundleTotal = round2(componentTotal * (1 - rule.percent / 100));
  return {
    promotionId,
    promotionName,
    slug: rule.slug,
    headline: rule.headline ?? promotionName,
    description: rule.description,
    percent: rule.percent,
    components,
    componentTotal: round2(componentTotal),
    bundleTotal,
    saving: round2(componentTotal - bundleTotal),
    addable: components.length > 0 && components.every((c) => !c.missing),
  };
}
