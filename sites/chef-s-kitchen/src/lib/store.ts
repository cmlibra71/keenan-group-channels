import { unstable_cache } from "next/cache";
import { initCommerceDb, createChannelStore, getCommerceClient, blogService } from "@keenan/services";
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
  customerAuthTokenService,
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
  productChannelAssignmentService,
  getEffectivePrice,
  getEffectivePrices,
  getEffectivePricesForProducts,
  shippingRateCardService,
  wantsStripeTestMode,
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
// CD passes no topCategories args (uses listTopLevelSlim defaults) and uses
// category-only related products (no curated upsells).
// ============================================================================

const _store = createChannelStore(CHANNEL_ID, unstable_cache, {
  useCuratedUpsells: false,
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
  getCmsTemplate,
  getDesignTokens,
  getDraftDesignTokens,
  getCheckoutSettings,
  calculateShipping,
} = _store;

export type { MegaMenuNode, MegaMenuFeatured, ContentPage } from "@keenan/services";

// ============================================================================
// Channel settings (raw + typed accessors)
// ============================================================================

export const getChannelSetting = async (key: string): Promise<unknown> => {
  try {
    const setting = await channelSettingsService.getByKey(CHANNEL_ID, key);
    return setting.setting_value;
  } catch {
    return null;
  }
};

// CMS-editable footer content (the `footer` channel setting). Empty object →
// the Footer component falls back to DEFAULT_FOOTER (current content).
// ── Blog (relational blog_posts, per-channel) ───────────────────────────────
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

export const getFooterConfig = unstable_cache(
  async () => ((await getChannelSetting("footer")) as Record<string, unknown>) ?? {},
  [`footer-${CHANNEL_ID}`],
  { revalidate: 1800, tags: [`channel-${CHANNEL_ID}`, "channel-settings"] }
);

// Custom header nav items (Navigation editor → `nav_structure.header`). Empty =
// the storefront falls back to the category-driven mega-menu.
export type HeaderNavItem = { label: string; url: string; children?: { label: string; url: string }[] };
export const getHeaderNav = unstable_cache(
  async (): Promise<HeaderNavItem[]> => {
    const nav = (await getChannelSetting("nav_structure")) as { header?: HeaderNavItem[] } | null;
    return Array.isArray(nav?.header) ? nav!.header : [];
  },
  [`header-nav-${CHANNEL_ID}`],
  { revalidate: 1800, tags: [`channel-${CHANNEL_ID}`, "channel-settings"] }
);

/** True when Stripe should run in TEST mode for this channel: the portal "Payments
 * test mode" toggle (`payments_test_mode`) OR a non-production NODE_ENV. Delegates to
 * the canonical @keenan/services helper — the single source of truth for every
 * test-vs-live Stripe selection (gateway keys, publishable key, price id). */
export const wantStripeTestMode = (): Promise<boolean> => wantsStripeTestMode(CHANNEL_ID);

// Channel-scoped JSON setting reader (CD-local copy; mirrors the factory's
// internal helper). Kept for direct use by CD-specific accessors.
export const getJsonSetting = async <T,>(key: string, fallback: T): Promise<T> => {
  try {
    const setting = await channelSettingsService.getByKey(CHANNEL_ID, key);
    return (setting.setting_value as T) ?? fallback;
  } catch {
    return fallback;
  }
};

/** GA4 Measurement ID (`G-XXXXXXXX`) for this channel — powers the gtag.js tag +
 *  client ecommerce funnel. Empty string when GA4 isn't configured (tag omitted). */
export const getGa4MeasurementId = unstable_cache(
  async () => getJsonSetting<string>("ga4_measurement_id", ""),
  [`ga4-measurement-id-${CHANNEL_ID}`],
  { revalidate: 1800, tags: [`channel-${CHANNEL_ID}`, "channel-settings"] }
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

/**
 * Guest orders (customer_id IS NULL) on this channel whose billing email matches
 * `email`, so a signed-in customer sees the orders they placed as a guest. Match
 * is normalized: case-insensitive, `+tag` suffix stripped, and dots stripped in
 * the local part for gmail/googlemail — so chris+test@gmail.com, chris.t@gmail.com
 * and chris@gmail.com all resolve to the same inbox. Returns the same shape as the
 * order list rows. Callers MUST gate this on the account being trustworthy for the
 * email (see the orders page: unverified self-registrations are excluded) — the
 * match is on the email string alone.
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
  customerService,
  customerAuthTokenService,
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
  productChannelAssignmentService,
  getEffectivePrice,
  getEffectivePrices,
  getEffectivePricesForProducts,
  shippingRateCardService,
  CHANNEL_ID,
};
