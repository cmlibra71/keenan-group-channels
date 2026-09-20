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
//
// WHERE THE PRICES AND THE NAMES COME FROM, and why it is not a plain product
// read. Every component is resolved through `getProductBySlug`, the SAME
// accessor the product page uses, and then through the catalogue-scope
// chokepoint:
//
//   • `getProductBySlug` is CHANNEL-SCOPED (it inner-joins this channel's
//     visible assignment), so a product that belongs to the other storefront
//     resolves to nothing here and the bundle says so, instead of advertising a
//     product this site does not sell;
//   • it is SUPPRESSION-SANITISED (`stripSuppressedCatalogPricing`), so on a
//     channel that suppresses the shared catalogue sale price — Chefs Depot —
//     this page quotes RRP, which is what the CD cart charges. Reading
//     `products.sale_price` raw is the Q9hRTbKO defect: the page advertised
//     $44.00 while the cart charged $50.00, and all 149 CAP-/SC- products on
//     channel 2 carry a sale price, so it fired on this card's own ranges;
//   • `isProductVisibleToViewer` applies the per-account product restrictions and
//     the group ∩ contact category access that `lib/catalog-scope.ts` records as
//     the single read-time chokepoint, so a product exclusive to somebody else's
//     account cannot appear on a public bundle page.
//
// The SKU lookup that precedes all that is used for ONE thing — finding the slug
// — and nothing it returns is ever shown or priced.
//
// WHEN A BUNDLE IS ON SALE AT ALL is decided upstream, in
// `loadBundlePromotions` -> `loadPromotionsForChannel`, whose SQL filters the
// status, the channel AND the date window. That last one is not decoration: this
// page never reaches `evaluatePromotions`, so without the window a bundle past
// its end date kept serving "Bundle price (ex GST) $X" with a live Add button
// while the cart charged full component prices. A bundle outside its window now
// simply does not exist here — `/bundles/[slug]` 404s and the index omits it.
// ============================================================================

import { loadBundlePromotions, parseOfferRule, type FixedBundleRule } from "@keenan/services";
import { productService, CHANNEL_ID, getProductBySlug } from "@/lib/store";
import { isProductVisibleToViewer } from "@/lib/catalog-scope";

export type BundleComponentView = {
  sku: string;
  quantity: number;
  productId: number | null;
  variantId: number | null;
  name: string;
  /** The per-unit price this storefront charges, ex GST, or null when unknown. */
  unitPrice: number | null;
  slug: string | null;
  /**
   * True when this component cannot be sold here as advertised: the SKU is not
   * in this storefront's catalogue, it is not for this viewer, OR it resolves
   * with no usable price.
   *
   * THE PRICE CASE MATTERS AS MUCH AS THE OTHER TWO. A component with no price
   * contributes nothing to `componentTotal`, so a bundle that kept it addable
   * would print a "Bundle price" BELOW what the cart is going to charge — a page
   * quoting a figure we will not honour, which is the one thing this page may
   * never do (see the module header and the `sf-bundle-page` register entry).
   */
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

/**
 * SKU → slug, and nothing else.
 *
 * `products.url_path` is the key every channel-scoped, sanitised read is keyed
 * by, and a bundle is authored in SKUs. Deliberately the only thing taken from
 * this read: its row is not channel-scoped, not suppression-sanitised and not
 * scope-filtered, so a name or a price taken from here would be exactly the
 * defect this module's header describes.
 */
async function slugForSku(sku: string): Promise<string | null> {
  try {
    const found = await productService.list({
      page: 1,
      limit: 1,
      sort: "id",
      direction: "asc",
      filters: { sku: { type: "eq", value: sku } },
    });
    const row = found.data[0] as { url_path?: string | null } | undefined;
    const slug = (row?.url_path ?? "").trim();
    return slug === "" ? null : slug;
  } catch {
    return null;
  }
}

/**
 * The component as THIS storefront and THIS viewer see it, or null when it is
 * not theirs to see. One shape out, so the page cannot accidentally render a
 * half-resolved row.
 */
async function resolveComponent(
  sku: string
): Promise<{ id: number; name: string; unitPrice: number | null; slug: string } | null> {
  const slug = await slugForSku(sku);
  if (!slug) return null;

  const product = (await getProductBySlug(slug).catch(() => null)) as
    | {
        id: number;
        name?: string | null;
        price?: string | number | null;
        salePrice?: string | number | null;
        urlPath?: string | null;
        categoryIds?: number[] | null;
      }
    | null;
  if (!product) return null;
  if (!(await isProductVisibleToViewer(product.id, product.categoryIds ?? null))) return null;

  // The price a shopper sees on the product page: the channel's sale price where
  // the channel HAS one after suppression, otherwise RRP. Account contract prices
  // and member pricing are deliberately not resolved here — this page is read by
  // signed-out shoppers too, and the CART is where the real price is decided for
  // THAT shopper. The page says so.
  const sale = product.salePrice == null ? NaN : parseFloat(String(product.salePrice));
  const list = product.price == null ? NaN : parseFloat(String(product.price));
  const unit = Number.isFinite(sale) && sale > 0 ? sale : Number.isFinite(list) && list > 0 ? list : null;

  return {
    id: product.id,
    name: (product.name ?? "").trim() || sku,
    unitPrice: unit,
    slug: product.urlPath ?? slug,
  };
}

async function resolveBundle(
  promotionId: number,
  promotionName: string,
  rule: FixedBundleRule
): Promise<BundleView> {
  const components: BundleComponentView[] = [];
  let componentTotal = 0;

  for (const component of rule.components) {
    const resolved = await resolveComponent(component.sku);
    if (resolved?.unitPrice != null) componentTotal += resolved.unitPrice * component.quantity;

    components.push({
      sku: component.sku,
      quantity: component.quantity,
      productId: resolved?.id ?? null,
      variantId: null,
      name: resolved?.name ?? component.sku,
      unitPrice: resolved?.unitPrice ?? null,
      slug: resolved?.slug ?? null,
      // No price is as disqualifying as no product: an unpriced component is
      // left out of `componentTotal`, so keeping it addable would advertise a
      // bundle price below the one the cart will charge.
      missing: !resolved || resolved.unitPrice == null,
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
