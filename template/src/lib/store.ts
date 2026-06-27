import { unstable_cache } from "next/cache";
import { initCommerceDb } from "@keenan/services";
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
  productService,
  productImageService,
  productVariantService,
  productAttachmentService,
  bulkPricingRuleService,
  customerService,
  accountService,
  orderService,
  orderItemService,
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
  checkoutSettingsHelper,
  getEffectivePrice,
  getEffectivePrices,
  getEffectivePricesForProducts,
  shippingRateCalculator,
  shippingRateCardService,
  blogService,
  productUpsellService,
} from "@keenan/services";
import { googlePlacesService } from "@keenan/services/integrations";
import type { Channel, Site } from "@keenan/services";

// Auto-initialize DB connection on first import
const dbUrl = process.env.COMMERCE_DATABASE_URL;
if (dbUrl) {
  initCommerceDb(dbUrl, { maxConnections: 5 });
}

const CHANNEL_ID = parseInt(process.env.CHANNEL_ID || "1", 10);

// ============================================================================
// Site Config
// ============================================================================

export const getSiteConfig = unstable_cache(
  async (): Promise<{ channel: Channel | null; site: Site | null }> => {
    try {
      // getById returns the snake_cased row; `Channel` is the camelCase model. Only
      // `channel.name` is read downstream (same in both casings), so this nominal cast
      // is behaviour-preserving.
      const channel = await channelService.getById(CHANNEL_ID) as unknown as Channel;
      const site = await siteService.getPrimaryForChannel(CHANNEL_ID) as Site | null;
      return { channel, site };
    } catch {
      return { channel: null, site: null };
    }
  },
  [`site-config-${CHANNEL_ID}`],
  { revalidate: 3600, tags: [`channel-${CHANNEL_ID}`, "site-config"] }
);

// ============================================================================
// Catalog sale-price suppression (channel-flagged)
//
// products.sale_price is shared across channels and carries Industry Kitchens'
// public Zoey price. Channels that sell at RRP with member-only cost-plus
// pricing (Chef's Depot) set `suppress_catalog_sale_price` so the imported
// sale price never reaches display, cart, quote, or checkout paths. The data
// itself is never mutated — this is a read-time filter.
// ============================================================================

let suppressFlagCache: { value: boolean; expires: number } | null = null;

export const shouldSuppressCatalogSalePrice = async (): Promise<boolean> => {
  if (suppressFlagCache && suppressFlagCache.expires > Date.now()) return suppressFlagCache.value;
  const value = await getFeatureFlag("suppress_catalog_sale_price");
  suppressFlagCache = { value, expires: Date.now() + 60_000 };
  return value;
};

const stripRowSalePrice = <T,>(row: T): T => {
  if (row && typeof row === "object" && "salePrice" in (row as Record<string, unknown>)) {
    return { ...(row as Record<string, unknown>), salePrice: null } as T;
  }
  return row;
};

/** Null salePrice on a list of product rows when the channel suppresses it. */
export const sanitizeCatalogProducts = async <T,>(rows: T[]): Promise<T[]> =>
  (await shouldSuppressCatalogSalePrice()) ? rows.map(stripRowSalePrice) : rows;

/** Null salePrice on a single product (and its variants) when suppressed. */
export const sanitizeCatalogProduct = async <T,>(row: T): Promise<T> => {
  if (!row || !(await shouldSuppressCatalogSalePrice())) return row;
  const cleaned = stripRowSalePrice(row) as Record<string, unknown>;
  if (Array.isArray(cleaned.variants)) {
    cleaned.variants = cleaned.variants.map(stripRowSalePrice);
  }
  return cleaned as T;
};

// ============================================================================
// Products (channel-scoped)
// ============================================================================

export const getProducts = (options?: {
  page?: number;
  limit?: number;
  categoryId?: number;
  brandId?: number;
  featured?: boolean;
  onSale?: boolean;
  search?: string;
}) => {
  const key = `products-${CHANNEL_ID}-${JSON.stringify(options || {})}`;
  return unstable_cache(
    async () => {
      const result = await productService.listForChannel(CHANNEL_ID, options);
      return { ...result, products: await sanitizeCatalogProducts(result.products) };
    },
    [key],
    { revalidate: 300, tags: [`channel-${CHANNEL_ID}`, "products"] }
  )();
};

export const getProductBySlug = (slug: string) => unstable_cache(
  async () => sanitizeCatalogProduct(await productService.getBySlug(slug, CHANNEL_ID)),
  [`product-slug-${CHANNEL_ID}-${slug}`],
  { revalidate: 120, tags: [`channel-${CHANNEL_ID}`, "products"] }
)();

// ============================================================================
// Categories
// ============================================================================

// maxDepth=0 → only true top-level departments. The IK category tree keeps
// brand categories at depth 1, so we exclude them from "Shop by Category".
export const getTopCategories = unstable_cache(
  async () => categoryService.listTopLevelSlim(CHANNEL_ID, 12, 0),
  [`top-categories-${CHANNEL_ID}`],
  { revalidate: 1800, tags: [`channel-${CHANNEL_ID}`, "categories"] }
);

export const getCategories = async () => categoryService.listVisibleSlim(CHANNEL_ID);

// ── Mega menu ───────────────────────────────────────────────────────────
// Department tree (3 levels) for the header mega menu, plus the per-
// department featured panel content from the `mega_menu_featured` channel
// setting: { [categoryId]: { image_url?, heading, body?, cta_text?, cta_href? } }.

export type MegaMenuFeatured = {
  image_url?: string;
  heading: string;
  body?: string;
  cta_text?: string;
  cta_href?: string;
};

export type MegaMenuNode = {
  id: number;
  name: string;
  slug: string;
  children: MegaMenuNode[];
};

export const getMegaMenu = unstable_cache(
  async (): Promise<{ departments: MegaMenuNode[]; featured: Record<string, MegaMenuFeatured> }> => {
    const rows = (await categoryService.listVisibleSlim(CHANNEL_ID)) as {
      id: number;
      name: string;
      slug: string;
      depth: number | null;
      parent_id: number | null;
      sort_order: number | null;
    }[];

    const byId = new Map<number, MegaMenuNode>();
    for (const r of rows) byId.set(r.id, { id: r.id, name: r.name, slug: r.slug, children: [] });
    const departments: MegaMenuNode[] = [];
    for (const r of rows) {
      const node = byId.get(r.id)!;
      if ((r.depth ?? 0) === 0 || r.parent_id == null) departments.push(node);
      else byId.get(r.parent_id)?.children.push(node);
    }

    const featuredSetting = await (async () => {
      try {
        const setting = await channelSettingsService.getByKey(CHANNEL_ID, "mega_menu_featured");
        return (setting.setting_value as Record<string, MegaMenuFeatured>) ?? {};
      } catch {
        return {};
      }
    })();

    return { departments, featured: featuredSetting };
  },
  [`mega-menu-${CHANNEL_ID}`],
  { revalidate: 1800, tags: [`channel-${CHANNEL_ID}`, "categories", "channel-settings"] }
);

/** Faceted category listing (faceted category page). Not cached — the
 *  filter-combination space is huge and the queries are index-friendly. */
export const getCategoryListing = async (
  categoryId: number,
  opts?: Parameters<typeof productService.listCategoryFaceted>[2]
) => {
  const result = await productService.listCategoryFaceted(CHANNEL_ID, categoryId, opts);
  return { ...result, products: await sanitizeCatalogProducts(result.products) };
};

export const getCategoryBySlug = (slug: string) => unstable_cache(
  async () => categoryService.getBySlug(slug, CHANNEL_ID),
  [`category-slug-${CHANNEL_ID}-${slug}`],
  { revalidate: 1800, tags: [`channel-${CHANNEL_ID}`, "categories"] }
)();

export const getSubcategories = (parentId: number) => unstable_cache(
  async () => categoryService.listActiveChildrenSlim(parentId),
  [`subcategories-${CHANNEL_ID}-${parentId}`],
  { revalidate: 1800, tags: [`channel-${CHANNEL_ID}`, "categories"] }
)();

export const getCategoryStats = (categoryId: number) => unstable_cache(
  async () => categoryService.getCategoryStats(categoryId),
  [`category-stats-${CHANNEL_ID}-${categoryId}`],
  { revalidate: 300, tags: [`channel-${CHANNEL_ID}`, "categories"] }
)();

export const getCategoryBreadcrumbs = (pathIds: number[]) => unstable_cache(
  async () => categoryService.getBreadcrumbs(pathIds, CHANNEL_ID),
  [`category-breadcrumbs-${CHANNEL_ID}-${pathIds.join(",")}`],
  { revalidate: 1800, tags: [`channel-${CHANNEL_ID}`, "categories"] }
)();

// Channel-scoped breadcrumb trail for a product. A product's category
// assignments can span several channels' trees; this resolves only the
// categories in THIS channel's tree, so every crumb links to a category page
// that actually exists on this storefront.
export const getProductBreadcrumbs = (productId: number) => unstable_cache(
  async () => categoryService.getProductBreadcrumbs(productId, CHANNEL_ID),
  [`product-breadcrumbs-${CHANNEL_ID}-${productId}`],
  { revalidate: 1800, tags: [`channel-${CHANNEL_ID}`, "categories"] }
)();

export const getCategoryById = (categoryId: number) => unstable_cache(
  async () => categoryService.getById(categoryId),
  [`category-by-id-${CHANNEL_ID}-${categoryId}`],
  { revalidate: 1800, tags: [`channel-${CHANNEL_ID}`, "categories"] }
)();

// ============================================================================
// Brands (channel-scoped via products)
// ============================================================================

export const getBrandsForChannel = unstable_cache(
  async () => {
    const brandIds = await productService.getBrandIdsForChannel(CHANNEL_ID);
    if (brandIds.length === 0) return [];
    const brands = await brandService.getByIds(brandIds);
    return brands.sort((a, b) => a.name.localeCompare(b.name));
  },
  [`brands-${CHANNEL_ID}`],
  { revalidate: 1800, tags: [`channel-${CHANNEL_ID}`, "brands"] }
);

export const getBrandBySlug = (slug: string) => unstable_cache(
  async () => brandService.getBySlug(slug),
  [`brand-slug-${CHANNEL_ID}-${slug}`],
  { revalidate: 1800, tags: [`channel-${CHANNEL_ID}`, "brands"] }
)();

// ============================================================================
// Reviews (product-scoped)
// ============================================================================

export const getProductReviews = (productId: number) => unstable_cache(
  async () => {
    const result = await reviewService.list({
      page: 1,
      limit: 50,
      sort: "created_at",
      direction: "desc",
      filters: {
        product_id: { type: "eq", value: productId },
        status: { type: "eq", value: "approved" },
      },
    });
    return result.data;
  },
  [`reviews-${CHANNEL_ID}-${productId}`],
  { revalidate: 300, tags: [`channel-${CHANNEL_ID}`, "reviews"] }
)();

// ============================================================================
// Attachments (product-scoped)
// ============================================================================

export const getProductAttachments = (productId: number) => unstable_cache(
  async () => {
    const result = await productAttachmentService.listForChannel(productId, CHANNEL_ID, {
      limit: 50,
    });
    return result.data;
  },
  [`attachments-${CHANNEL_ID}-${productId}`],
  { revalidate: 1800, tags: [`channel-${CHANNEL_ID}`, "attachments"] }
)();

// ============================================================================
// Related Products (same category)
// ============================================================================

export const getRelatedProducts = (productId: number, categoryIds: number[]) => unstable_cache(
  async () => {
    // 1) Real curated upsells / related from product_upsells (imported from
    //    the original Zoey site). When present, this is the source of truth.
    const curated = await productUpsellService.listRelated(productId, ["upsell", "related"], 12);
    if (curated.length >= 4) return sanitizeCatalogProducts(curated);

    // 2) Fallback to category-based recommendations when no curated edges
    //    exist or the curated list is sparse.
    if (categoryIds.length === 0) return sanitizeCatalogProducts(curated);
    for (const catId of categoryIds) {
      const result = await productService.listForChannel(CHANNEL_ID, {
        categoryId: catId,
        limit: 13,
      });
      const related = result.products.filter((p: { id: number }) => p.id !== productId).slice(0, 12);
      if (related.length >= 4) return sanitizeCatalogProducts(related);
    }
    const result = await productService.listForChannel(CHANNEL_ID, {
      categoryId: categoryIds[categoryIds.length - 1],
      limit: 13,
    });
    return sanitizeCatalogProducts(
      result.products.filter((p: { id: number }) => p.id !== productId).slice(0, 12)
    );
  },
  [`related-${CHANNEL_ID}-${productId}-${categoryIds.join(",")}`],
  { revalidate: 300, tags: [`channel-${CHANNEL_ID}`, "products"] }
)();

// ============================================================================
// Subscriptions (channel-scoped)
// ============================================================================

export const getSubscriptionPlans = unstable_cache(
  async () => subscriptionPlanService.listActiveForChannel(CHANNEL_ID),
  [`subscription-plans-${CHANNEL_ID}`],
  { revalidate: 300, tags: [`channel-${CHANNEL_ID}`, "subscription-plans"] }
);

export const getActiveSubscription = async (customerId: number) => {
  return subscriptionService.getActiveForCustomer(customerId, CHANNEL_ID);
};

/**
 * Member prices for listing cards, keyed by product id. Only meaningful for
 * an active member's customer group — pass null to get an empty map. The
 * price is included only when it actually undercuts the regular price.
 */
export const getMemberPriceMap = async (
  productIds: number[],
  customerGroupId: number | null
): Promise<Record<number, number>> => {
  if (!customerGroupId || productIds.length === 0) return {};
  const prices = await getEffectivePricesForProducts(productIds, CHANNEL_ID, customerGroupId);
  const map: Record<number, number> = {};
  for (const [productId, price] of prices) {
    if (!price.salePrice) continue;
    const sale = parseFloat(price.salePrice);
    const regular = price.price != null ? parseFloat(price.price) : NaN;
    if (Number.isFinite(sale) && (!Number.isFinite(regular) || sale < regular)) {
      map[productId] = sale;
    }
  }
  return map;
};

// ============================================================================
// Draws (channel-scoped)
// ============================================================================

export const getUpcomingDraws = unstable_cache(
  async () => drawService.getUpcomingForChannel(CHANNEL_ID),
  [`upcoming-draws-${CHANNEL_ID}`],
  { revalidate: 300, tags: [`channel-${CHANNEL_ID}`, "draws"] }
);

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
// Partner Offers (channel-scoped)
// ============================================================================

export const getPartnerOffers = unstable_cache(
  async () => partnerOfferService.listActiveForChannel(CHANNEL_ID),
  [`partner-offers-${CHANNEL_ID}`],
  { revalidate: 300, tags: [`channel-${CHANNEL_ID}`, "partner-offers"] }
);

// ============================================================================
// Feature Flags
// ============================================================================

export const getFeatureFlag = async (key: string): Promise<boolean> => {
  try {
    const setting = await channelSettingsService.getByKey(CHANNEL_ID, key);
    return setting.setting_value === true || setting.setting_value === "true";
  } catch {
    return false;
  }
};

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

export type ContentPage = {
  title: string;
  heading?: string;
  summary?: string;
  body_html: string;
  meta_title?: string;
  meta_description?: string;
  updated?: string;
};

export const getContentPages = unstable_cache(
  async () => getJsonSetting<Record<string, ContentPage>>("content_pages", {}),
  [`content-pages-${CHANNEL_ID}`],
  { revalidate: 1800, tags: [`channel-${CHANNEL_ID}`, "channel-settings"] }
);

export const getContentPage = async (slug: string): Promise<ContentPage | null> => {
  const pages = await getContentPages();
  return pages[slug] ?? null;
};

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
// Re-export services for direct access
// ============================================================================

// ============================================================================
// Checkout Settings
// ============================================================================

export const getCheckoutSettings = async () =>
  checkoutSettingsHelper.getCheckoutSettings(CHANNEL_ID);

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

// ============================================================================
// Shipping Rate Calculation (channel-scoped)
// ============================================================================

export const calculateShipping = async (postcode: string, subtotal: number) =>
  shippingRateCalculator.calculate(CHANNEL_ID, postcode, subtotal);
