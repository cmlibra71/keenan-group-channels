import { unstable_cache } from "next/cache";
import { initCommerceDb, createChannelStore, getCommerceClient } from "@keenan/services";
import {
  channelService,
  siteService,
  channelSettingsService,
  storeSettingsService,
  paymentService,
  brandService,
  categoryService,
  categoryTreeService,
  cartService,
  cartItemService,
  quoteService,
  quoteItemService,
  reviewService,
  couponService,
  productService,
  productImageService,
  productVariantService,
  productAttachmentService,
  bulkPricingRuleService,
  customerService,
  accountService,
  orderService,
  orderItemService,
  orderShippingAddressService,
  subscriptionPlanService,
  subscriptionService,
  subscriptionEventService,
  drawTypeService,
  drawService,
  drawEntryService,
  prizeService,
  drawWinnerService,
  partnerOfferService,
  partnerDiscountCodeService,
  customerAddressService,
  getEffectivePrice,
  getEffectivePrices,
  shippingRateCalculator,
  shippingRateCardService,
  blogService,
} from "@keenan/services";
import { googlePlacesService } from "@keenan/services/integrations";
import { CHANNEL_ID } from "./channel";

// Auto-initialize DB connection on first import
const dbUrl = process.env.COMMERCE_DATABASE_URL;
if (dbUrl) {
  initCommerceDb(dbUrl, { maxConnections: 5 });
}

// ============================================================================
// Shared channel-store factory — all channel-scoped, cache-wrapped accessors
// live in @keenan/services. Caching (Next's unstable_cache) is injected here.
// ============================================================================

const _store = createChannelStore(CHANNEL_ID, unstable_cache, {
  topCategoriesLimit: 12,
  topCategoriesMaxDepth: 0,
  useCuratedUpsells: true,
});

export const {
  getSiteConfig,
  shouldSuppressCatalogSalePrice,
  sanitizeCatalogProduct,
  sanitizeCatalogProducts,
  getProducts,
  getProductBySlug,
  getTopCategories,
  getCategories,
  getMegaMenu,
  getCategoryListing,
  getCategoryBySlug,
  getSubcategories,
  getCategoryStats,
  getCategoryBreadcrumbs,
  getProductBreadcrumbs,
  getCategoryById,
  getBrandsForChannel,
  getBrandBySlug,
  getProductReviews,
  getProductAttachments,
  getRelatedProducts,
  getSubscriptionPlans,
  getActiveSubscription,
  getMemberPriceMap,
  getUpcomingDraws,
  getPartnerOffers,
  getFeatureFlag,
  getContentPages,
  getContentPage,
  getCmsPage,
  getCmsCategoryPage,
  getCheckoutSettings,
  calculateShipping,
} = _store;

export type { MegaMenuNode, MegaMenuFeatured, ContentPage } from "@keenan/services";

// ============================================================================
// Blog (channel-scoped)
// ============================================================================

export const getBlogPosts = (opts: { page?: number; limit?: number; tag?: string } = {}) =>
  unstable_cache(
    async () => blogService.listForChannel(CHANNEL_ID, opts),
    [`blog-list-${CHANNEL_ID}-${JSON.stringify(opts)}`],
    { revalidate: 300, tags: [`channel-${CHANNEL_ID}`, "blog"] }
  )();

export const getBlogPostBySlug = (slug: string) =>
  unstable_cache(
    async () => blogService.getBySlug(slug, CHANNEL_ID),
    [`blog-post-${CHANNEL_ID}-${slug}`],
    { revalidate: 300, tags: [`channel-${CHANNEL_ID}`, "blog"] }
  )();

export const getBlogTags = unstable_cache(
  async () => blogService.listTagsForChannel(CHANNEL_ID),
  [`blog-tags-${CHANNEL_ID}`],
  { revalidate: 1800, tags: [`channel-${CHANNEL_ID}`, "blog"] }
);

// ============================================================================
// Channel settings (typed accessors with defaults)
// ============================================================================

const getJsonSetting = async <T,>(key: string, fallback: T): Promise<T> => {
  try {
    const setting = await channelSettingsService.getByKey(CHANNEL_ID, key);
    return (setting.setting_value as T) ?? fallback;
  } catch {
    return fallback;
  }
};

export type HomepageCopy = {
  tagline?: string;
  hero?: { headline?: string; subheadline?: string; cta_text?: string; cta_href?: string };
  categories_heading?: string;
  categories_eyebrow?: string;
  brands_heading?: string;
  brands_eyebrow?: string;
  clearance_heading?: string;
  clearance_eyebrow?: string;
  featured_heading?: string;
};

export type ValueBarItem = { icon: string; label: string };

export const getHomepageCopy = unstable_cache(
  async () => getJsonSetting<HomepageCopy>("homepage_copy", {}),
  [`homepage-copy-${CHANNEL_ID}`],
  { revalidate: 1800, tags: [`channel-${CHANNEL_ID}`, "channel-settings"] }
);

export const getValueBarItems = unstable_cache(
  async () => getJsonSetting<ValueBarItem[]>("value_bar_items", []),
  [`value-bar-${CHANNEL_ID}`],
  { revalidate: 1800, tags: [`channel-${CHANNEL_ID}`, "channel-settings"] }
);

/** Klaviyo public (site) key for this channel — powers the onsite tracking snippet
 *  and client-side events. Empty string when Klaviyo isn't connected (snippet omitted). */
export const getKlaviyoPublicKey = unstable_cache(
  async () => getJsonSetting<string>("klaviyo_public_key", ""),
  [`klaviyo-public-key-${CHANNEL_ID}`],
  { revalidate: 1800, tags: [`channel-${CHANNEL_ID}`, "channel-settings"] }
);

// ============================================================================
// Homepage spotlights (curated product carousels backed by categories whose
// metafields.is_homepage_spotlight = true).
// ============================================================================

export type HomepageSpotlight = {
  id: number;
  heading: string;
  cta_href: string | null;
  products: Awaited<ReturnType<typeof productService.listForChannel>>["products"];
};

export type BannerBlock = {
  heading: string;
  subheading?: string;
  image_url?: string;
  cta_text?: string;
  cta_href?: string;
};

export type WhyShopItem = { icon?: string; heading: string; body?: string };

export type LinkRef = { label: string; href: string; image_url?: string };

export type CustomerLogo = { name: string; image_url: string; href?: string };

export type SpecialistCta = {
  heading?: string;
  body?: string;
  phone?: string;
  cta_text?: string;
  cta_href?: string;
};

export type PaymentBadge = { name: string; image_url?: string };

export type FooterColumnSetting = { heading: string; links: { label: string; href: string }[] };
export type FooterSetting = {
  tagline?: string;
  columns?: FooterColumnSetting[];
  contact?: { phone?: string; email?: string; address?: string };
  social?: { platform: string; href: string }[];
  payment_badges?: PaymentBadge[];
  legal?: string;
};

export const getBannerBlocks = unstable_cache(
  async () => getJsonSetting<BannerBlock[]>("homepage_banners", []),
  [`home-banners-${CHANNEL_ID}`],
  { revalidate: 1800, tags: [`channel-${CHANNEL_ID}`, "channel-settings"] }
);

export const getWhyShop = unstable_cache(
  async () => getJsonSetting<{ heading?: string; items?: WhyShopItem[] }>("why_shop", {}),
  [`why-shop-${CHANNEL_ID}`],
  { revalidate: 1800, tags: [`channel-${CHANNEL_ID}`, "channel-settings"] }
);

export const getCustomerLogos = unstable_cache(
  async () => getJsonSetting<{ heading?: string; logos?: CustomerLogo[] }>("customer_logos", {}),
  [`customer-logos-${CHANNEL_ID}`],
  { revalidate: 1800, tags: [`channel-${CHANNEL_ID}`, "channel-settings"] }
);

export const getKnowledgeHubLinks = unstable_cache(
  async () => getJsonSetting<{ heading?: string; links?: LinkRef[] }>("knowledge_hub_links", {}),
  [`knowledge-hub-${CHANNEL_ID}`],
  { revalidate: 1800, tags: [`channel-${CHANNEL_ID}`, "channel-settings"] }
);

export const getSpecialistCta = unstable_cache(
  async () => getJsonSetting<SpecialistCta>("specialist_cta", {}),
  [`specialist-cta-${CHANNEL_ID}`],
  { revalidate: 1800, tags: [`channel-${CHANNEL_ID}`, "channel-settings"] }
);

export const getFooterConfig = unstable_cache(
  async () => getJsonSetting<FooterSetting>("footer", {}),
  [`footer-${CHANNEL_ID}`],
  { revalidate: 1800, tags: [`channel-${CHANNEL_ID}`, "channel-settings"] }
);

export const getHomepageSpotlights = unstable_cache(
  async (): Promise<HomepageSpotlight[]> => {
    const rows = (await categoryService.listHomepageSpotlights?.(CHANNEL_ID)) as
      | Array<{ id: number; name: string; slug: string; metafields: Record<string, unknown> | null }>
      | undefined;
    if (!rows || rows.length === 0) return [];
    const spotlights = await Promise.all(
      rows.map(async (r) => {
        const meta = r.metafields ?? {};
        const result = await productService.listForChannel(CHANNEL_ID, {
          categoryId: r.id,
          limit: 8,
        });
        return {
          id: r.id,
          heading: (meta.spotlight_heading as string) || r.name,
          cta_href: (meta.spotlight_cta_href as string) || null,
          products: await sanitizeCatalogProducts(result.products),
        };
      })
    );
    return spotlights.filter((s) => s.products.length > 0);
  },
  [`homepage-spotlights-${CHANNEL_ID}`],
  { revalidate: 600, tags: [`channel-${CHANNEL_ID}`, "categories", "products"] }
);

// ============================================================================
// Sitemap (slim, paged catalog queries)
//
// The XML sitemap can list tens of thousands of product URLs (CD ≈ 38k), so it
// must NOT go through productService.listForChannel (which joins images, brands
// and resolves pricing). These read only url_path + updated_at for the channel's
// visible products, paged so each sitemap chunk stays well under the 50k limit.
// ============================================================================

// Raw postgres.js (not Drizzle) to avoid the dual drizzle-orm copy bundled in
// @keenan/services — its tables are typed against a nested drizzle install that
// is structurally incompatible with the root one's query builders.

function toDate(value: string | Date): Date | null {
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

export async function getSitemapProducts(
  offset: number,
  limit: number
): Promise<Array<{ slug: string; updatedAt: Date | null }>> {
  const sql = getCommerceClient();
  if (!sql) return [];
  const rows = await sql<{ id: number; url_path: string | null; updated_at: string | Date | null }[]>`
    SELECT p.id, p.url_path, p.updated_at
    FROM product_channel_assignments a
    JOIN products p ON p.id = a.product_id
    WHERE a.channel_id = ${CHANNEL_ID} AND a.is_visible = true AND p.is_visible = true
    ORDER BY p.id
    LIMIT ${limit} OFFSET ${offset}`;
  // Product routes are keyed by url_path, falling back to the numeric id
  // (mirrors ProductGrid: `slug={product.urlPath || String(product.id)}`).
  return rows.map((r) => ({
    slug: r.url_path || String(r.id),
    // postgres.js returns timestamptz as a string here; coerce to Date so Next
    // serialises a valid W3C <lastmod>. Drop unparseable values.
    updatedAt: r.updated_at ? toDate(r.updated_at) : null,
  }));
}

// ============================================================================
// Re-export services for direct access
// ============================================================================

export {
  channelService,
  siteService,
  channelSettingsService,
  storeSettingsService,
  paymentService,
  brandService,
  categoryService,
  categoryTreeService,
  cartService,
  cartItemService,
  quoteService,
  quoteItemService,
  reviewService,
  couponService,
  productService,
  productImageService,
  productVariantService,
  productAttachmentService,
  bulkPricingRuleService,
  customerService,
  accountService,
  customerAddressService,
  orderService,
  orderItemService,
  orderShippingAddressService,
  subscriptionPlanService,
  subscriptionService,
  subscriptionEventService,
  drawTypeService,
  drawService,
  drawEntryService,
  prizeService,
  drawWinnerService,
  partnerOfferService,
  partnerDiscountCodeService,
  googlePlacesService,
  getEffectivePrice,
  getEffectivePrices,
  shippingRateCalculator,
  shippingRateCardService,
  CHANNEL_ID,
};
