/**
 * The Chefs Depot product page's search title and meta description (card CfnjZikj).
 *
 * Chefs Depot keeps its OWN title and description per product (`product_channel_seo`, written
 * automatically and editable in the portal). The shared `products.page_title` /
 * `meta_description` are Industry Kitchens' wording — the Zoey import writes them, and 2,020 of
 * them say "…available from Industry Kitchens." So this page reads its own row first and only
 * then falls back, and the fallback never serves text naming the other store: this page's title
 * was always the product name, and a description that mentions Industry Kitchens is passed over
 * for the next one down.
 *
 * Pure, so the order is unit-tested (`product-seo.test.ts`).
 */

export const PRODUCT_META_MAX = 160;

const OTHER_STORE = /industry\s*kitchens?|industrykitchens/i;

function plain(text: unknown): string {
  return String(text ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ProductSeoSource {
  name?: unknown;
  metaDescription?: unknown;
  descriptionShort?: unknown;
}

export interface OwnProductSeo {
  pageTitle: string | null;
  metaDescription: string | null;
}

export function productPageSeo(
  product: ProductSeoSource,
  own: OwnProductSeo | null | undefined
): { title: string; description: string } {
  const name = plain(product.name) || "Product";
  const title = plain(own?.pageTitle) || name;
  const candidates = [own?.metaDescription, product.metaDescription, product.descriptionShort]
    .map(plain)
    .filter((text) => text && !OTHER_STORE.test(text));
  const description = (
    candidates[0] || `${name} — professional kitchen equipment at Chefs Depot.`
  ).slice(0, PRODUCT_META_MAX);
  return { title, description };
}
