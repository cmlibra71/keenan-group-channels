import { unstable_cache } from "next/cache";
import type { NodeTree } from "@keenan/services/builder";
import { withPromoTagInComponents } from "@/builder/promo-tag-node";
import { PROMO_TAG_LABEL } from "@/lib/promo-tag";
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
  customerAuthTokenService,
  accountService,
  contactService,
  orderService,
  orderItemService,
  orderShippingAddressService,
  shipmentService,
  orderTransactionService,
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
  loadAccountStatement,
} from "@keenan/services";
import { googlePlacesService } from "@keenan/services/integrations";
import { CHANNEL_ID } from "./channel";
import { withBrandLogoFallback, targetsForChannel } from "@/builder/product-card-brand-logo";
import type { MegaNavItem } from "./mega-menu";
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
  getSubscriptionPlans,
  getActiveSubscription,
  getMemberPriceMap,
  getMemberSavingsPctMap,
  applyAccountPricesToProducts,
  // The Chefs Depot buying-group ladder (cards gk23c1VK / Nyp8bkPm). All four are
  // no-ops on a channel with no ladder in `channel_settings`, which is every
  // channel until one is written.
  getMemberLadderLevelId,
  getLadderConfig,
  getLadderVariantPrices,
  getMemberTrailingSpend,
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
  getProductPageData,
  getNamedStyles,
} = _store;

// ============================================================================
// Component masters, with the two read-time transforms this storefront applies.
//
// They compose in this order:
//
//   1. the brand-logo image fallback (card tSrCcnvx) — a product with no image,
//      or a broken one, shows its BRAND's logo instead of the grey package box.
//      Tim asked for it on Industry Kitchens (2026-08-19); Steve asked for the
//      same on Chefs Depot on 2026-08-24, "until the missing images are
//      sourced". WHICH masters are rewritten is this CHANNEL's business, so the
//      target list is resolved here and passed in: the transform itself is
//      shared code and never reads the ambient channel.
//   2. the "Buy more & save" tile tag (card FNYihLHk, Steve 2026-08-23) — every
//      Chefs Depot product tile carries the tagline pill under the brand, name
//      and price. The wording comes from this site's own `lib/promo-tag.ts`.
//
// BOTH are placed HERE, once, rather than in each of the node branches that
// load components (category, brand, home, product, `/pages/[slug]`), because a
// branch that forgot the call would serve grey boxes — or drop the tag — on one
// of our own screens and not on the next, for the same product. Chefs Depot's
// category pages render their tiles from the stored `product-card` master
// rather than from `ProductCard.tsx` (`node_category_template_enabled` is on
// for channel 2) and the product page's "You may also like" rail repeats that
// very same master, so a React-only fix would miss the busiest listing surfaces
// on the site.
//
// Nothing is written to the stored tree — see `product-card-brand-logo.ts` and
// `builder/promo-tag-node.ts`. A channel with no brand-logo targets gets a
// pass-through by reference, and a site whose `lib/promo-tag.ts` holds null gets
// the map back untouched, which is the tag's channel gate.
// ============================================================================

type ComponentMap = Awaited<ReturnType<typeof _store.getComponents>>;

const BRAND_LOGO_TARGETS = targetsForChannel(CHANNEL_ID);

const withMasterTransforms = (components: ComponentMap): ComponentMap =>
  withPromoTagInComponents(
    withBrandLogoFallback(components, BRAND_LOGO_TARGETS) as Record<string, NodeTree>,
    PROMO_TAG_LABEL
  ) as ComponentMap;

export const getComponents = async (): Promise<ComponentMap> =>
  withMasterTransforms(await _store.getComponents());

export const getDraftComponents = async (): Promise<ComponentMap> =>
  withMasterTransforms((await _store.getDraftComponents()) as ComponentMap);

export type { MegaMenuNode, MegaMenuFeatured, ContentPage } from "@keenan/services";

// Contact-keyed active subscription (identity unification: the session subject
// is a CONTACT id, so the member badge / pricing / checkout all key off it).
// The channel store's getActiveSubscription remains customer-keyed for legacy
// callers; storefront code should use this.
export const getActiveSubscriptionForContact = (contactId: number) =>
  subscriptionService.getActiveForContact(contactId, CHANNEL_ID);

/**
 * This account's STATEMENT on THIS storefront (card k6pHXQBf).
 *
 * The channel is bound here and cannot be passed in. That is the whole guard behind Tim's rule
 * (2026-08-10, in capitals): "THERE IS NEVER ANY CROSS OVER - THEY ARE SEPARATE BUSINESSES." A
 * Chefs Depot page physically cannot ask for an Industry Kitchens statement, whatever it passes.
 *
 * The arithmetic — what is owed, how it ages, and the invoice/payment/credit history — is the same
 * module the portal's Statement tab, printed copy and emailed copy use, so a customer reading
 * their statement online and a staff member reading it in the portal see one document.
 */
export const getAccountStatement = (
  accountId: number,
  options: { from?: string | null; to?: string | null } = {}
) => loadAccountStatement(accountId, CHANNEL_ID, options);

/**
 * The date this PERSON became a member — the earliest subscription we hold for
 * them on this channel, not the start of the row they are on today (card
 * pgRmsaTX: "they will need to see that they are a member also with the date of
 * subscription").
 *
 * Earliest, because a member who re-subscribed (or whose sign-up wrote a
 * superseded row — three Chefs Depot members carry one) is not a new member, and
 * because staff answer "when did I join" from the same date the customer reads.
 * Null when nothing is held; the caller then shows no date rather than a wrong one.
 */
export const getMemberSince = async (contactId: number): Promise<string | null> => {
  try {
    const rows = (await subscriptionService.listForContact(contactId, CHANNEL_ID)) as Array<{
      created_at: string | null;
    }>;
    let earliest: string | null = null;
    for (const row of rows) {
      if (!row.created_at) continue;
      if (!earliest || new Date(row.created_at) < new Date(earliest)) earliest = row.created_at;
    }
    return earliest;
  } catch {
    // A membership date is decoration on an account page — never cost the page.
    return null;
  }
};

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

/**
 * Several channel settings in ONE round trip.
 *
 * `getChannelSetting` validates the channel and then selects, so N keys cost 2N
 * queries. This layout resolves settings on EVERY page of the site, and speed is
 * a stakeholder-visible feature (Tim, 7 Aug demo) — a caller wanting a fixed set
 * of keys asks once. A key with no row is absent from the map, exactly as
 * `getChannelSetting` returns null for it; a failed read is an empty map, so a
 * settings outage degrades to "nothing configured" rather than to an error page.
 */
export const getChannelSettings = async (
  keys: readonly string[]
): Promise<Record<string, unknown>> => {
  try {
    return await channelSettingsService.getValuesByKeys(CHANNEL_ID, keys);
  } catch {
    return {};
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
  // Same 5-minute window as the index and the post page. A scheduled post
  // brings its tags with it when its moment passes, and nothing purges the
  // cache at that moment — a longer window would leave the facet describing a
  // blog that no longer exists for up to half an hour.
  { revalidate: 300, tags: [`channel-${CHANNEL_ID}`, "blog"] }
);

export const getFooterConfig = unstable_cache(
  async () => ((await getChannelSetting("footer")) as Record<string, unknown>) ?? {},
  [`footer-${CHANNEL_ID}`],
  { revalidate: 1800, tags: [`channel-${CHANNEL_ID}`, "channel-settings"] }
);

// Custom header nav items (Navigation editor → `nav_structure.header`). Empty =
// the storefront falls back to the category-driven mega-menu. `categories` items
// render the All Departments entry; `category` items render a department with its
// auto mega panel (resolved against the category tree by categoryId).
export type HeaderNavItem = MegaNavItem;

/** Saved items carry a type; anything hand-written or older is read as a link
 *  so one odd row cannot take the header down. */
const normalizeNavItems = (value: unknown): MegaNavItem[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((i): i is Record<string, unknown> => !!i && typeof i === "object")
    .map((i) => ({
      type: (i.type as MegaNavItem["type"]) ?? "link",
      label: typeof i.label === "string" ? i.label : "",
      url: typeof i.url === "string" ? i.url : undefined,
      categoryId: typeof i.categoryId === "number" ? i.categoryId : undefined,
      pageSlug: typeof i.pageSlug === "string" ? i.pageSlug : undefined,
      newTab: i.newTab === true,
      children: normalizeNavItems(i.children),
    }))
    .filter((i) => i.label);
};

export const getHeaderNav = unstable_cache(
  async (): Promise<HeaderNavItem[]> => {
    const nav = (await getChannelSetting("nav_structure")) as { header?: unknown } | null;
    return normalizeNavItems(nav?.header);
  },
  [`header-nav-${CHANNEL_ID}`],
  { revalidate: 1800, tags: [`channel-${CHANNEL_ID}`, "channel-settings"] }
);

/** Departments switched off in the portal (Storefront > Navigation > Mega menu).
 *  Kept OUT of getMegaMenu: the same department tree also feeds the homepage
 *  category blocks and the /categories page, and this switch is about the menu
 *  only (card 9wau4Tx9, Steve 2026-08-10). */
export const getMegaMenuHidden = unstable_cache(
  async (): Promise<number[]> => {
    const value = await getChannelSetting("mega_menu_hidden_categories");
    return Array.isArray(value) ? value.filter((v): v is number => typeof v === "number") : [];
  },
  [`mega-menu-hidden-${CHANNEL_ID}`],
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

/** The category rail's filter configuration for this channel — which of
 *  Sub-category / Brand / Price are shown, in what order, under what heading,
 *  open or collapsed. Set in the portal (Products > Filtering), which busts
 *  `channel-${CHANNEL_ID}` on save, so an edit lands on the next page view; the
 *  TTL is only the backstop. Never configured = the defaults (all three, open). */
export const getStorefrontFilters = unstable_cache(
  async () =>
    normalizeStorefrontFilters(
      await getJsonSetting<unknown>(STOREFRONT_FILTERS_SETTING_KEY, null)
    ),
  [`storefront-filters-${CHANNEL_ID}`],
  { revalidate: 300, tags: [`channel-${CHANNEL_ID}`, "channel-settings"] }
);

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
    WHERE ${guestOrderForEmailCondition(sql, target)}
    ORDER BY id DESC
    LIMIT 50`;
  return rows;
}

/**
 * THE guest-order rule, as one SQL fragment: a channel order with no customer and
 * no contact whose billing email resolves to the same inbox as `normalizedEmail`.
 *
 * Deliberately shared by {@link getGuestOrdersForEmail} (the history list) and
 * {@link isGuestOrderForEmail} (the per-order access gate). Two copies of this
 * CASE expression would drift, and a drift here is not cosmetic: a looser copy
 * WIDENS who can read an order, a tighter one 404s an order the list is showing.
 */
function guestOrderForEmailCondition(
  sql: NonNullable<ReturnType<typeof getCommerceClient>>,
  normalizedEmail: string
) {
  return sql`customer_id IS NULL
      AND contact_id IS NULL
      AND channel_id = ${CHANNEL_ID}
      AND CASE
        WHEN split_part(lower(billing_address->>'email'), '@', 2) IN ('gmail.com','googlemail.com')
        THEN regexp_replace(split_part(split_part(lower(billing_address->>'email'), '@', 1), '+', 1), '\\.', '', 'g')
        ELSE split_part(split_part(lower(billing_address->>'email'), '@', 1), '+', 1)
      END || '@' || split_part(lower(billing_address->>'email'), '@', 2) = ${normalizedEmail}`;
}

/**
 * True when THIS order is a guest order on this channel that belongs to `email`'s
 * inbox — the single-row form of {@link getGuestOrdersForEmail}, for the order
 * detail page's access gate.
 *
 * Not expressed as "is it in the list?": the list is capped at 50 rows, so a
 * shopper with a long guest history would be 404'd on their own older orders.
 * Same normalisation, no cap, one order.
 */
export async function isGuestOrderForEmail(orderId: number, email: string): Promise<boolean> {
  const sql = getCommerceClient();
  if (!sql || !email || !Number.isFinite(orderId)) return false;
  const target = normalizeEmailForMatch(email);
  if (!target) return false;
  const rows = await sql<{ id: number }[]>`
    SELECT id FROM orders
    WHERE id = ${orderId}
      AND ${guestOrderForEmailCondition(sql, target)}
    LIMIT 1`;
  return rows.length > 0;
}

/**
 * The payment term agreed with the account an order bills to, in days, or `null`
 * when no term is on record.
 *
 * Orders placed through the storefront stamp the term they were quoted; orders
 * created elsewhere (and most of the historical ones) do not, and the account is
 * then the only place the real term lives. Both routes to it are tried in one
 * round trip — the order's own `account_id`, then the account behind the order's
 * contact — because on this channel most net-terms orders carry a contact but no
 * account id.
 *
 * `accounts.net_terms_days` defaults to 0, which means "no term recorded", not
 * "due immediately" — hence the `> 0` test. A null answer must stay null: the
 * page says the invoice follows on the agreed terms rather than quoting a number
 * the business never agreed.
 */
export async function getAccountNetTermsDays(
  accountId: number | null | undefined,
  contactId: number | null | undefined
): Promise<number | null> {
  const sql = getCommerceClient();
  if (!sql) return null;
  const account = Number.isFinite(accountId) ? Number(accountId) : 0;
  const contact = Number.isFinite(contactId) ? Number(contactId) : 0;
  if (account <= 0 && contact <= 0) return null;
  try {
    const rows = await sql<{ days: number | null; rank: number }[]>`
      SELECT a.net_terms_days AS days, 1 AS rank
        FROM accounts a
       WHERE a.id = ${account}
      UNION ALL
      SELECT a.net_terms_days AS days, 2 AS rank
        FROM contacts c
        JOIN accounts a ON a.id = c.account_id
       WHERE c.id = ${contact}
      ORDER BY rank`;
    for (const row of rows) {
      const days = Number(row.days);
      if (Number.isFinite(days) && days > 0) return Math.round(days);
    }
  } catch {
    // Best-effort: no term on record reads the same as a lookup that failed.
  }
  return null;
}

/**
 * Storefront URLs for the products a customer may still open, keyed by product id.
 *
 * An order keeps its line items forever, but the product behind a line can be
 * retired or pulled from this channel — linking to it would land the customer on
 * a 404 inside their own order history. Same channel-visibility join the sitemap
 * uses ({@link getSitemapProducts}); anything absent renders as plain text.
 */
export async function getLinkableProductPaths(productIds: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const sql = getCommerceClient();
  const ids = [...new Set(productIds.filter((id) => Number.isFinite(id)))];
  if (!sql || ids.length === 0) return out;
  const rows = await sql<{ id: number; url_path: string | null }[]>`
    SELECT p.id, p.url_path
    FROM product_channel_assignments a
    JOIN products p ON p.id = a.product_id
    WHERE a.channel_id = ${CHANNEL_ID}
      AND a.is_visible = true
      AND p.is_visible = true
      AND p.id = ANY(${ids})`;
  for (const row of rows) {
    // Product routes are keyed by url_path, falling back to the numeric id
    // (mirrors ProductGrid: `slug={product.urlPath || String(product.id)}`).
    out.set(Number(row.id), row.url_path || String(row.id));
  }
  return out;
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
  shipmentService,
  orderTransactionService,
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
