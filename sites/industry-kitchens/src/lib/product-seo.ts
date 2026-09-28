/**
 * The Industry Kitchens product page's <head>: title, meta description, canonical,
 * Open Graph / Twitter image and the Product JSON-LD (IK parity root cause
 * `product-seo-head`, 2026-09-28).
 *
 * Until this, the product route had no `generateMetadata` at all, so every one of
 * the ~39k product pages carried the site's generic title and description. The old
 * site (www.industrykitchens.com.au, the oracle) titles a product page
 * "<name> | Industry Kitchens" — measured on three pages, and it is exactly what
 * the Zoey import wrote into `products.page_title` for 38,685 products. So the
 * title is `page_title` as imported, else the product name, with the store name
 * appended only when it is not already there.
 *
 * The price in the structured data is the price THIS PAGE SHOWS a visitor with no
 * account — the shared catalogue resolver's effective price (a sale only when it is
 * below the price), or a configurable's "Starting From" range — ex GST (the storefront's
 * default view — the GST switch starts on "ex"), and it says so with
 * `valueAddedTaxIncluded: false`. A product the page sells by quote only — price
 * hidden, Zoey "quote only", Add to Cart switched off, or no price at all ("Call for
 * Price") — gets NO offer, so we never publish a price the page does not.
 *
 * Chefs Depot has its own `lib/product-seo.ts` (its own title/description rules,
 * card CfnjZikj); this file is Industry Kitchens' and deliberately not shared.
 *
 * Pure — no next/*, no database — so it is unit-tested (`product-seo.test.ts`).
 */

import { resolveCatalogPrice, resolveFromPrice, type MoneyLike, type PriceRow } from "@keenan/services/catalog-price";

export const STORE_NAME = "Industry Kitchens";
export const PRODUCT_META_MAX = 160;

const STORE_NAME_RE = /industry\s*kitchens?/i;

/** HTML to one line of plain text. */
export function plainText(text: unknown): string {
  return String(text ?? "")
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** Cut at a word boundary, never mid-word, with an ellipsis when anything was cut. */
export function excerpt(text: string, max = PRODUCT_META_MAX): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.–—-]+$/, "")}…`;
}

export interface ProductSeoSource {
  name?: unknown;
  pageTitle?: unknown;
  metaDescription?: unknown;
  descriptionShort?: unknown;
  description?: unknown;
}

/** "<page_title or name> | Industry Kitchens" — the old site's pattern. */
export function productPageTitle(product: ProductSeoSource): string {
  const base = plainText(product.pageTitle) || plainText(product.name) || "Product";
  return STORE_NAME_RE.test(base) ? base : `${base} | ${STORE_NAME}`;
}

/** The product's own meta description, else a clean excerpt of its copy. */
export function productMetaDescription(product: ProductSeoSource): string {
  const own = plainText(product.metaDescription);
  if (own) return own;
  const copy = plainText(product.descriptionShort) || plainText(product.description);
  if (copy) return excerpt(copy);
  const name = plainText(product.name) || "Product";
  return `${name} — commercial kitchen equipment from ${STORE_NAME}.`;
}

type ImageRow = { urlStandard?: string | null; urlZoom?: string | null; isThumbnail?: boolean | null; sortOrder?: number | null };

/** The main image: the one flagged as the thumbnail, else the first by sort order. Absolute. */
export function productMainImage(images: unknown, baseUrl: string): string | null {
  if (!Array.isArray(images) || images.length === 0) return null;
  const rows = (images as ImageRow[]).filter((i) => i && (i.urlStandard || i.urlZoom));
  if (rows.length === 0) return null;
  const main =
    rows.find((i) => i.isThumbnail === true) ??
    [...rows].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))[0];
  return absoluteUrl(main.urlStandard || main.urlZoom || "", baseUrl);
}

export function absoluteUrl(url: string, baseUrl: string): string | null {
  const u = url.trim();
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith("//")) return `https:${u}`;
  return `${baseUrl.replace(/\/+$/, "")}/${u.replace(/^\/+/, "")}`;
}

export function productCanonicalUrl(slug: string, baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/products/${slug}`;
}

export interface ProductOfferSource {
  price?: unknown;
  salePrice?: unknown;
  hidePrice?: boolean | null;
  purchasingDisabled?: boolean | null;
  restrictAddToCart?: boolean | null;
  availability?: string | null;
  /**
   * The configurable half of the product row (`getProductBySlug`): its variants, options and the
   * variant→option mappings. The page is in "pick a variation" mode exactly when there are options
   * AND mappings (the purchase provider's `useGroupedMode`), and the pickable choices are the
   * variants that carry a mapping. Absent / empty on a simple product.
   */
  variants?: ReadonlyArray<{ id: number; price?: unknown; salePrice?: unknown }> | null;
  options?: ReadonlyArray<unknown> | null;
  variantOptionMappings?: ReadonlyArray<{ variantId: number }> | null;
}

/** The price the page shows before a variant is picked — one figure, or a from/to range. */
export interface PublicPrice {
  /** The figure the page shows ex GST: the effective price, or the "Starting From" price. */
  low: number;
  /** The dearest pickable choice's effective price (= `low` on a simple product). */
  high: number;
  /** How many priced choices the range covers (1 on a simple product). */
  count: number;
  /** A configurable product — the page reads "Starting From", the structured data is a range. */
  configurable: boolean;
}

function quoteOnly(product: ProductOfferSource): boolean {
  return product.hidePrice === true || product.purchasingDisabled === true || product.restrictAddToCart === true;
}

/** The pickable variants of a configurable product, or [] when the page is not in pick mode. */
function configurableChoices(product: ProductOfferSource): PriceRow[] {
  const options = product.options ?? [];
  const mappings = product.variantOptionMappings ?? [];
  if (options.length === 0 || mappings.length === 0) return [];
  const mapped = new Set(mappings.map((m) => m.variantId));
  return (product.variants ?? [])
    .filter((v) => mapped.has(v.id))
    .map((v) => ({ price: v.price as MoneyLike, salePrice: v.salePrice as MoneyLike }));
}

/**
 * The price a visitor with no account sees on the page (ex GST), or null when the page shows
 * none — "Call for Price", a hidden price, or a quote-only product.
 *
 * Through the SAME resolver the page and the cart share (`@keenan/services/catalog-price`), so the
 * structured data can never state a price the page does not (IK judge, wave 1: the JSON-LD used the
 * raw `sale_price` and published $408.18 for a table base the page and the cart sell at $54.00 —
 * a "sale" above the list price is not a sale):
 *
 *   simple product        → `resolveCatalogPrice(product).effective`: the sale only when
 *                           0 < sale < price, else the price.
 *   configurable product  → the page's "Starting From" figure (`resolveFromPrice` over the
 *                           pickable variants, parent included), up to the dearest choice — so a
 *                           parent holding $0 over priced variants (Elizabeth coffee beans,
 *                           variants $28.80 / $59.40) publishes its from price, while a
 *                           configurable priced at $0 everywhere still publishes nothing.
 */
export function publicDisplayPrice(product: ProductOfferSource): number | null {
  return publicPrice(product)?.low ?? null;
}

export function publicPrice(product: ProductOfferSource): PublicPrice | null {
  if (quoteOnly(product)) return null;
  const parent: PriceRow = { price: product.price as MoneyLike, salePrice: product.salePrice as MoneyLike };
  const choices = configurableChoices(product);
  if (choices.length > 0) {
    const from = resolveFromPrice(parent, choices);
    if (from == null) return null;
    const priced = choices.map((c) => resolveCatalogPrice(parent, c).effective).filter((n) => n > 0);
    const high = Math.max(from.effective, ...priced);
    return { low: from.effective, high, count: Math.max(1, priced.length), configurable: true };
  }
  const effective = resolveCatalogPrice(parent, null).effective;
  return effective > 0 ? { low: effective, high: effective, count: 1, configurable: false } : null;
}

export function schemaAvailability(availability: string | null | undefined): string {
  switch ((availability ?? "available").toLowerCase()) {
    case "available":
      return "https://schema.org/InStock";
    case "preorder":
      return "https://schema.org/PreOrder";
    default:
      return "https://schema.org/OutOfStock";
  }
}

export interface ProductJsonLdInput extends ProductOfferSource {
  name?: unknown;
  sku?: string | null;
  brandName?: string | null;
  image?: string | null;
  description?: string | null;
  condition?: string | null;
  url: string;
}

export function schemaCondition(condition: string | null | undefined): string {
  const c = (condition ?? "").toLowerCase();
  if (c === "used") return "https://schema.org/UsedCondition";
  if (c === "refurbished") return "https://schema.org/RefurbishedCondition";
  return "https://schema.org/NewCondition";
}

/**
 * Product structured data; `offers` only when the page shows a price.
 *
 * A simple product carries one `Offer` at the price the page shows. A configurable product
 * carries an `AggregateOffer` — `lowPrice` is the page's "Starting From" figure and `highPrice`
 * the dearest choice — because no single `price` is true of every variation.
 */
export function productJsonLd(input: ProductJsonLdInput): Record<string, unknown> {
  const price = publicPrice(input);
  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: plainText(input.name) || "Product",
    url: input.url,
  };
  if (input.sku) ld.sku = input.sku;
  if (input.brandName) ld.brand = { "@type": "Brand", name: input.brandName };
  if (input.image) ld.image = [input.image];
  if (input.description) ld.description = input.description;
  if (price != null && price.configurable) {
    const low = price.low.toFixed(2);
    const high = price.high.toFixed(2);
    ld.offers = {
      "@type": "AggregateOffer",
      url: input.url,
      priceCurrency: "AUD",
      lowPrice: low,
      highPrice: high,
      offerCount: price.count,
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        minPrice: low,
        maxPrice: high,
        priceCurrency: "AUD",
        valueAddedTaxIncluded: false,
      },
      availability: schemaAvailability(input.availability),
      itemCondition: schemaCondition(input.condition),
    };
  } else if (price != null) {
    const amount = price.low.toFixed(2);
    ld.offers = {
      "@type": "Offer",
      url: input.url,
      priceCurrency: "AUD",
      price: amount,
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: amount,
        priceCurrency: "AUD",
        valueAddedTaxIncluded: false,
      },
      availability: schemaAvailability(input.availability),
      itemCondition: schemaCondition(input.condition),
    };
  }
  return ld;
}

/** JSON for a <script type="application/ld+json">, with `<` escaped so it cannot close the tag. */
export function jsonLdScript(ld: unknown): string {
  return JSON.stringify(ld).replace(/</g, "\\u003c");
}
