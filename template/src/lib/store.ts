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
  customerAuthTokenService,
  accountService,
  contactService,
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
import {
  STOREFRONT_FILTERS_SETTING_KEY,
  normalizeStorefrontFilters,
} from "./storefront-filters";

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
  getRedirectForPath,
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
  getProductVideos,
  getRelatedProducts,
  getProductPageData,
  getSubscriptionPlans,
  getActiveSubscription,
  getMemberPriceMap,
  applyAccountPricesToProducts,
  getUpcomingDraws,
  getPartnerOffers,
  getFeatureFlag,
  getContentPages,
  getContentPage,
  getCmsPage,
  getCmsCategoryPage,
  getCmsTemplate,
  getNamedStyles,
  getComponents,
  getDraftComponents,
  getDesignTokens,
  getDraftDesignTokens,
  getCheckoutSettings,
  calculateShipping,
} = _store;

// ============================================================================
// Channel settings (raw accessor)
//
// Both storefronts independently grew typed wrappers over this same read
// (header/footer/homepage config), which is what identified it as engine
// rather than site code — see docs/architecture/seam-audit.md §2c.
// ============================================================================

export const getChannelSetting = async (key: string): Promise<unknown> => {
  try {
    const setting = await channelSettingsService.getByKey(CHANNEL_ID, key);
    return setting.setting_value;
  } catch {
    return null;
  }
};

export type { MegaMenuNode, MegaMenuFeatured, ContentPage } from "@keenan/services";

// Contact-keyed active subscription (identity unification: the session subject
// is a CONTACT id, so the member badge / pricing / checkout all key off it).
// The channel store's getActiveSubscription remains customer-keyed for legacy
// callers; storefront code should use this.
export const getActiveSubscriptionForContact = (contactId: number) =>
  subscriptionService.getActiveForContact(contactId, CHANNEL_ID);

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
  // Same 5-minute window as the index and the post page. A scheduled post
  // brings its tags with it when its moment passes, and nothing purges the
  // cache at that moment — a longer window would leave the facet describing a
  // blog that no longer exists for up to half an hour.
  { revalidate: 300, tags: [`channel-${CHANNEL_ID}`, "blog"] }
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

/** The category rail's filter configuration for this channel — which of
 *  Sub-category / Brand / Price are shown, in what order, under what heading,
 *  open or collapsed. Set in the portal (Products > Filtering), which busts
 *  `channel-${id}` on save, so an edit lands on the next page view; the TTL is
 *  only the backstop. Never configured = the defaults (all three, open). */
export const getStorefrontFilters = unstable_cache(
  async () =>
    normalizeStorefrontFilters(
      await getJsonSetting<unknown>(STOREFRONT_FILTERS_SETTING_KEY, null)
    ),
  [`storefront-filters-${CHANNEL_ID}`],
  { revalidate: 300, tags: [`channel-${CHANNEL_ID}`, "channel-settings"] }
);

/** Klaviyo public (site) key for this channel — powers the onsite tracking snippet
 *  and client-side events. Empty string when Klaviyo isn't connected (snippet omitted). */
export const getKlaviyoPublicKey = unstable_cache(
  async () => getJsonSetting<string>("klaviyo_public_key", ""),
  [`klaviyo-public-key-${CHANNEL_ID}`],
  { revalidate: 1800, tags: [`channel-${CHANNEL_ID}`, "channel-settings"] }
);

/** GA4 Measurement ID (`G-XXXXXXXX`) for this channel — powers the gtag.js tag +
 *  client ecommerce funnel. Empty string when GA4 isn't configured (tag omitted). */
export const getGa4MeasurementId = unstable_cache(
  async () => getJsonSetting<string>("ga4_measurement_id", ""),
  [`ga4-measurement-id-${CHANNEL_ID}`],
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

// Portal-managed header quick links (Storefront > Navigation writes this key).
export type HeaderNavItem = { label: string; href: string };

export const getHeaderNav = unstable_cache(
  async () => getJsonSetting<HeaderNavItem[]>("header_nav", []),
  [`header-nav-${CHANNEL_ID}`],
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
): Promise<Array<{ id: number; slug: string; updatedAt: Date | null }>> {
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
    // id is carried so the sitemap can drop products restricted to an account (a crawler is a GUEST).
    id: r.id,
    slug: r.url_path || String(r.id),
    // postgres.js returns timestamptz as a string here; coerce to Date so Next
    // serialises a valid W3C <lastmod>. Drop unparseable values.
    updatedAt: r.updated_at ? toDate(r.updated_at) : null,
  }));
}

/**
 * Guest orders (no customer_id AND no contact_id) on this channel whose billing
 * email matches
 * `email`, so a signed-in customer sees the orders they placed as a guest. Match
 * is normalized: case-insensitive, `+tag` suffix stripped, and dots stripped in
 * the local part for gmail/googlemail — so chris+test@gmail.com, chris.t@gmail.com
 * and chris@gmail.com all resolve to the same inbox. Returns the same shape as the
 * order list rows. Match is on the email string alone, so use this ONLY for
 * read-only order history — never to grant a financial entitlement (e.g. B2B net
 * terms, which stays gated on `email_verified`; see net-terms.ts).
 */
export async function getGuestOrdersForEmail(
  email: string
): Promise<Array<{ id: number; order_number: string; status: string; total_inc_tax: string; created_at: string | Date | null }>> {
  const sql = getCommerceClient();
  if (!sql || !email) return [];
  const target = normalizeEmailForMatch(email);
  if (!target) return [];
  const rows = await sql<{ id: number; order_number: string; status: string; total_inc_tax: string; created_at: string | Date | null }[]>`
    SELECT id, order_number, status, total_inc_tax, created_at
    FROM orders
    WHERE customer_id IS NULL
      AND contact_id IS NULL
      AND channel_id = ${CHANNEL_ID}
      AND CASE
        WHEN split_part(lower(billing_address->>'email'), '@', 2) IN ('gmail.com','googlemail.com')
        THEN regexp_replace(split_part(split_part(lower(billing_address->>'email'), '@', 1), '+', 1), '\\.', '', 'g')
        ELSE split_part(split_part(lower(billing_address->>'email'), '@', 1), '+', 1)
      END || '@' || split_part(lower(billing_address->>'email'), '@', 2) = ${target}
    ORDER BY id DESC
    LIMIT 50`;
  return rows;
}

/**
 * Current buy costs for a set of order lines, keyed `${productId}:${variantId ?? 0}`.
 * Variant cost wins over the product cost (same precedence as the pricing
 * engine's applyCostPlus). Feeds the checkout below-cost sentry — a slim raw
 * read, deliberately not productService (no joins, no pricing resolution).
 */
export async function getLineCosts(
  lines: Array<{ productId: number; variantId: number | null }>
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const sql = getCommerceClient();
  if (!sql || lines.length === 0) return out;
  const productIds = [...new Set(lines.map((l) => l.productId))];
  const variantIds = [...new Set(lines.map((l) => l.variantId).filter((v): v is number => v != null))];
  const [products, variants] = await Promise.all([
    sql<{ id: number; cost_price: string | null }[]>`
      SELECT id, cost_price FROM products WHERE id = ANY(${productIds})`,
    variantIds.length
      ? sql<{ id: number; cost_price: string | null }[]>`
          SELECT id, cost_price FROM product_variants WHERE id = ANY(${variantIds})`
      : Promise.resolve([]),
  ]);
  const productCost = new Map(products.map((p) => [p.id, p.cost_price]));
  const variantCost = new Map(variants.map((v) => [v.id, v.cost_price]));
  for (const line of lines) {
    const raw = (line.variantId != null ? variantCost.get(line.variantId) : null) ?? productCost.get(line.productId);
    const cost = raw == null ? NaN : parseFloat(raw);
    if (Number.isFinite(cost) && cost > 0) out.set(`${line.productId}:${line.variantId ?? 0}`, cost);
  }
  return out;
}

/** Normalize an email for inbox-equivalent matching (mirrors the SQL above). */
function normalizeEmailForMatch(email: string): string {
  const [rawLocal, rawDomain] = email.toLowerCase().trim().split("@");
  if (!rawDomain) return "";
  let local = rawLocal.split("+")[0];
  if (rawDomain === "gmail.com" || rawDomain === "googlemail.com") local = local.replace(/\./g, "");
  return `${local}@${rawDomain}`;
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
  customerAuthTokenService,
  accountService,
  contactService,
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
