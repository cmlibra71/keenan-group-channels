// ============================================================================
// CD homepage section blocks. Each block is an async component that fetches its
// own data and renders the EXACT markup previously inlined in app/page.tsx, so
// the block-composed homepage is pixel-identical to the legacy one. Editable
// surface: block presence + order (managed via the `home` CMS page), plus the
// already-data-driven copy (hero/SEO/FAQ via channel settings).
//
// Keep markup here in exact sync with the legacy homepage when sections change.
// ============================================================================
import Link from "next/link";
import Image from "next/image";
import { Crown, ArrowRight, ChevronRight } from "lucide-react";
import {
  getProducts,
  getSiteConfig,
  getMegaMenu,
  getTopCategories,
  getFeatureFlag,
  getSubscriptionPlans,
  getUpcomingDraws,
  getBrandsForChannel,
  prizeService,
  productChannelAssignmentService,
  CHANNEL_ID,
  getJsonSetting,
} from "@/lib/store";
import { BLOCK_REGISTRY } from "@keenan/services";
import { getListingPricing } from "@/lib/member";
import { ProductGrid } from "@/components/product/ProductGrid";
import { TrustBar } from "@/components/home/TrustBar";
import { SeoFaq } from "@/components/home/SeoFaq";
import { MembershipValueStrip } from "@/components/home/MembershipValueStrip";
import { DrawSpotlight } from "@/components/home/DrawSpotlight";
import { StatsBanner } from "@/components/home/StatsBanner";
import { BrandShowcase } from "@/components/home/BrandShowcase";
import { ClearanceSpotlight } from "@/components/home/ClearanceSpotlight";
import { Ga4Promotion } from "@/components/analytics/Ga4Promotion";
import type { Ga4Promo } from "@/components/analytics/ga4";
import type { ReactNode } from "react";

/** Wrap a homepage promo creative in GA4 view/select_promotion tracking.
 *  Null blocks (disabled membership/draw) render nothing and fire no event. */
function promo(node: ReactNode, meta: Ga4Promo): ReactNode {
  return node ? <Ga4Promotion promotion={meta}>{node}</Ga4Promotion> : null;
}

// ---------------------------------------------------------------------------
// Shared membership/draw data (cached underneath, so per-block fetch is cheap).
// ---------------------------------------------------------------------------
async function getMembershipContext() {
  const [subscriptionsEnabled, drawsEnabled] = await Promise.all([
    getFeatureFlag("subscriptions_enabled"),
    getFeatureFlag("draws_enabled"),
  ]);
  let plan: { price: string; billing_interval: string; slug: string; benefits: unknown } | null = null;
  let featuredPrize: { id: number; name: string; imageUrl: string | null; value: string | null } | null = null;
  let featuredDraw: { id: number; name: string; scheduled_at: string | Date | null } | null = null;

  if (subscriptionsEnabled) {
    const [plans, upcomingDraws, activePrizes] = await Promise.all([
      getSubscriptionPlans(),
      drawsEnabled ? getUpcomingDraws() : Promise.resolve([]),
      drawsEnabled ? prizeService.listActiveForChannel(CHANNEL_ID) : Promise.resolve([]),
    ]);
    plan = plans[0] ?? null;
    featuredDraw = upcomingDraws[0] ?? null;
    if (activePrizes.length > 0) {
      featuredPrize = activePrizes.reduce((best, p) => {
        const val = p.value ? parseFloat(p.value) : 0;
        const bestVal = best.value ? parseFloat(best.value) : 0;
        return val > bestVal ? p : best;
      });
    }
  }
  const planPrice = plan ? parseFloat(plan.price) : null;
  const planBenefits = plan
    ? ((plan.benefits as string[]) || []).filter((b) => drawsEnabled || !/draw|raffle|prize/i.test(b))
    : [];
  return { subscriptionsEnabled, drawsEnabled, plan, planPrice, planBenefits, featuredPrize, featuredDraw };
}

// ── Hero ────────────────────────────────────────────────────────────────────
// Editable-copy helper: use the block prop when it's a non-empty string, else
// fall back to the given default.
const str = (v: unknown, fallback: string): string =>
  typeof v === "string" && v.trim() ? v : fallback;

// `copy(type, key, props)` — prop override, else the registry defaultProps value
// (the single source of truth for default copy, shared with the portal placeholder).
const regDefault = (type: string, key: string): string => {
  const d = BLOCK_REGISTRY[type]?.defaultProps?.[key];
  return typeof d === "string" ? d : "";
};
const copy = (type: string, key: string, props: Record<string, unknown>): string =>
  str(props[key], regDefault(type, key));

async function HomeHero(props: Record<string, unknown> = {}) {
  const { channel } = await getSiteConfig();
  const { subscriptionsEnabled, plan, planPrice, planBenefits, featuredPrize, featuredDraw } =
    await getMembershipContext();
  const [productCount, brandCount] = await Promise.all([
    productChannelAssignmentService.countForChannel(CHANNEL_ID),
    productChannelAssignmentService.countBrandsForChannel(CHANNEL_ID),
  ]);

  if (subscriptionsEnabled && plan) {
    const eyebrow = copy("home_hero", "eyebrow", props);
    const headline = copy("home_hero", "headline", props);
    const headlineEmphasis = copy("home_hero", "headline_emphasis", props);
    const subheadline = copy("home_hero", "subheadline", props).replace(
      "{price}",
      `$${planPrice!.toFixed(2)}/${plan.billing_interval}`
    );
    const ctaText = copy("home_hero", "cta_text", props);
    const ctaHref = copy("home_hero", "cta_href", props);
    const cta2Text = copy("home_hero", "cta2_text", props);
    const cta2Href = copy("home_hero", "cta2_href", props);
    return (
      <section className="relative flex min-h-[520px] items-center overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('/images/hero-bg.webp')" }} />
        <div className="absolute inset-0 bg-[linear-gradient(100deg,rgba(20,22,20,.78)_0%,rgba(28,30,28,.5)_50%,rgba(20,22,20,.62)_100%)]" />
        <div className="relative z-10 container-page w-full py-10">
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
            <div className="glass self-center p-8 text-white lg:p-10">
              <p className="mb-[18px] text-[11.5px] font-bold uppercase tracking-[0.16em] text-white/85">
                {eyebrow}
              </p>
              <h1 className="hero-title text-white">
                {headline}{" "}
                <em className="not-italic text-member-bright">{headlineEmphasis}</em>
              </h1>
              <p className="mt-[18px] max-w-[44ch] text-base leading-[1.55] text-white/[0.88]">
                {subheadline}
              </p>
              <div className="mt-[26px] flex flex-wrap gap-3">
                <Link href={ctaHref} className="btn-primary">
                  {ctaText}
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href={cta2Href} className="btn-glass">
                  {cta2Text}
                </Link>
              </div>
            </div>
            <div className="flex flex-col gap-[18px] self-center">
              {featuredPrize ? (
                <Link
                  href="/membership#draws"
                  className="group ml-auto block w-full max-w-[430px] rounded-panel border border-white/[0.14] bg-[rgba(20,16,18,.46)] p-7 text-white backdrop-blur-[14px] transition-colors hover:border-member/40"
                >
                  <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-member">
                    Members-Only Draw
                  </p>
                  <div className="flex items-start gap-5">
                    <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-card border border-white/5 bg-ink-800">
                      {featuredPrize.imageUrl ? (
                        <Image
                          src={featuredPrize.imageUrl}
                          alt={featuredPrize.name}
                          fill
                          sizes="96px"
                          className="object-contain transition-transform duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Crown className="h-8 w-8 text-member/30" />
                        </div>
                      )}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold leading-snug text-white">{featuredPrize.name}</h3>
                      {featuredPrize.value && parseFloat(featuredPrize.value) > 0 && (
                        <p className="mt-2 text-2xl font-bold text-member-bright">
                          ${parseFloat(featuredPrize.value).toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </p>
                      )}
                      {featuredDraw?.scheduled_at && (
                        <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-member/30 bg-member/15 px-3 py-1">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-member" />
                          <span className="text-xs font-semibold tracking-wide text-member-bright">
                            Next Draw: {new Date(featuredDraw.scheduled_at).toLocaleDateString("en-AU", { day: "numeric", month: "long" })}
                          </span>
                        </p>
                      )}
                    </div>
                  </div>
                </Link>
              ) : (
                <div className="ml-auto w-full max-w-[430px] rounded-panel border border-white/[0.14] bg-[rgba(20,16,18,.46)] px-7 py-[26px] text-white backdrop-blur-[14px]">
                  <Crown className="mb-2 h-[22px] w-[22px] text-member" />
                  <h3 className="heading-serif mb-3.5 text-[21px] text-white">Member Benefits</h3>
                  <ul>
                    {planBenefits.slice(0, 4).map((b, i) => (
                      <li key={i} className="flex items-center gap-[11px] py-2 text-[13.5px] text-white/90">
                        <span className={`h-0.5 w-4 shrink-0 ${i === 1 ? "bg-accent-bright" : "bg-member"}`} />
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <StatsBanner productCount={productCount} brandCount={brandCount} />
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="relative flex min-h-[460px] items-center overflow-hidden">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('/images/hero-bg.webp')" }} />
      <div className="absolute inset-0 bg-[linear-gradient(100deg,rgba(20,22,20,.78)_0%,rgba(28,30,28,.5)_50%,rgba(20,22,20,.62)_100%)]" />
      <div className="relative z-10 container-page w-full py-10">
        <div className="glass max-w-2xl p-8 text-white lg:p-10">
          <p className="mb-[18px] text-[11.5px] font-bold uppercase tracking-[0.16em] text-white/85">
            {str(props.eyebrow, "Commercial Kitchen Equipment")}
          </p>
          <h1 className="hero-title text-white">
            {str(props.headline, `Welcome to ${channel?.name || "our store"}`)}
          </h1>
          <p className="mt-[18px] max-w-[44ch] text-base leading-[1.55] text-white/[0.88]">
            {str(props.subheadline, "Discover our curated range of professional-grade kitchen equipment.")}
          </p>
          <Link href={str(props.cta_href, "/products")} className="btn-primary mt-[26px]">
            {str(props.cta_text, "Browse Equipment")}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

// ── Shop by category ──────────────────────────────────────────────────────────
async function ShopByCategory(props: Record<string, unknown> = {}) {
  const [topCategories, megaMenu] = await Promise.all([getTopCategories(), getMegaMenu()]);
  if (topCategories.length === 0) return null;
  return (
    <section className="container-page section-padding">
      <div className="mb-10 flex items-end justify-between">
        <div>
          <p className="eyebrow mb-3">{copy("shop_by_category", "eyebrow", props)}</p>
          <h2 className="section-title">{copy("shop_by_category", "heading", props)}</h2>
        </div>
        <Link href="/categories" className="hidden items-center gap-1.5 text-sm font-semibold text-accent transition-colors hover:text-accent-hover sm:inline-flex">
          View All
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {topCategories.slice(0, 8).map((category: { id: number; name: string; slug: string; image_url?: string | null }) => {
          const childCount = megaMenu.departments.find((d) => d.id === category.id)?.children.length ?? 0;
          return (
            <Link
              key={category.id}
              href={`/categories/${category.slug}`}
              className="group overflow-hidden rounded-card border border-border bg-white transition-all duration-200 hover:-translate-y-[3px] hover:border-brand-light hover:shadow-hover"
            >
              <div className="relative aspect-[4/3] bg-gradient-to-br from-brand-tint to-steel-200">
                {category.image_url && (
                  <Image
                    src={category.image_url}
                    alt={category.name}
                    fill
                    sizes="(max-width: 640px) 50vw, 25vw"
                    className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
                  />
                )}
              </div>
              <div className="flex items-center justify-between px-4 py-[15px]">
                <div>
                  <b className="block text-[15px] font-bold text-text-primary">{category.name}</b>
                  {childCount > 0 && (
                    <span className="text-[11.5px] text-steel-500">
                      {childCount} categor{childCount === 1 ? "y" : "ies"}
                    </span>
                  )}
                </div>
                <span className="grid h-[30px] w-[30px] place-items-center rounded-full bg-brand-tint text-brand-deep transition-colors duration-200 group-hover:bg-accent group-hover:text-white">
                  <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

// ── Membership value strip ────────────────────────────────────────────────────
async function MembershipStripBlock() {
  const { subscriptionsEnabled, plan, planPrice, planBenefits } = await getMembershipContext();
  if (!subscriptionsEnabled || !plan) return null;
  return (
    <MembershipValueStrip planPrice={planPrice!} billingInterval={plan.billing_interval} benefits={planBenefits} />
  );
}

// ── Brand showcase ────────────────────────────────────────────────────────────
async function BrandShowcaseBlock() {
  const allBrands = await getBrandsForChannel();
  const featuredBrands = [
    ...allBrands.filter((b: { image_url?: string | null }) => b.image_url),
    ...allBrands.filter((b: { image_url?: string | null }) => !b.image_url),
  ].slice(0, 9);
  return <BrandShowcase brands={featuredBrands} />;
}

// ── Clearance spotlight ───────────────────────────────────────────────────────
async function ClearanceSpotlightBlock(props: Record<string, unknown> = {}) {
  const { products: clearanceProducts } = await getProducts({ limit: 9, onSale: true });
  return (
    <ClearanceSpotlight
      products={clearanceProducts}
      heading={copy("clearance_spotlight", "heading", props)}
      eyebrow={copy("clearance_spotlight", "eyebrow", props)}
      pricing={await getListingPricing(clearanceProducts)}
    />
  );
}

// ── Featured products ─────────────────────────────────────────────────────────
async function FeaturedProductsBlock(props: Record<string, unknown> = {}) {
  const [{ products: featuredProducts }, memberPricingEnabled] = await Promise.all([
    getProducts({ limit: 8, featured: true }),
    getFeatureFlag("member_pricing_enabled"),
  ]);
  return (
    <section className="container-page section-padding">
      <div className="flex items-end justify-between mb-10">
        <div>
          <p className="eyebrow mb-3">{copy("featured_products", "eyebrow", props)}</p>
          <h2 className="section-title">{copy("featured_products", "heading", props)}</h2>
        </div>
        <Link href="/products?filter=featured" className="hidden sm:inline-flex items-center gap-1.5 nav-link">
          View All
          <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
      <ProductGrid products={featuredProducts} memberPricingAvailable={memberPricingEnabled} {...(await getListingPricing(featuredProducts))} listId="featured" listName="Featured Products" />
    </section>
  );
}

// ── SEO + FAQ ─────────────────────────────────────────────────────────────────
async function SeoFaqBlock() {
  return (
    <SeoFaq {...(await getJsonSetting("homepage_seo", {} as { heading?: string; body?: string; faqs?: { q: string; a: string }[] }))} />
  );
}

// ── Draw spotlight ────────────────────────────────────────────────────────────
async function DrawSpotlightBlock() {
  const { drawsEnabled, featuredPrize, featuredDraw } = await getMembershipContext();
  if (!drawsEnabled || !featuredPrize) return null;
  return <DrawSpotlight prize={featuredPrize} draw={featuredDraw} />;
}

// ---------------------------------------------------------------------------
// Block map fragment for the homepage. System blocks fetch their own live
// catalog data; editable copy (headings, hero text, CTAs) comes from `props`.
// ---------------------------------------------------------------------------
type BlockProps = { props: Record<string, unknown> };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const HOME_BLOCK_COMPONENTS: Record<string, (p: BlockProps) => any> = {
  home_hero: async ({ props }) =>
    promo(await HomeHero(props), { creative_name: "home_hero", creative_slot: "home_hero", promotion_name: "Homepage hero" }),
  trust_bar: () => <TrustBar />,
  shop_by_category: ({ props }) => ShopByCategory(props),
  membership_value_strip: async () =>
    promo(await MembershipStripBlock(), { creative_name: "membership_value_strip", creative_slot: "home_membership", promotion_name: "Membership" }),
  brand_showcase: () => BrandShowcaseBlock(),
  clearance_spotlight: async ({ props }) =>
    promo(await ClearanceSpotlightBlock(props), { creative_name: "clearance_spotlight", creative_slot: "home_clearance", promotion_name: "Clearance Specials" }),
  featured_products: ({ props }) => FeaturedProductsBlock(props),
  seo_faq: () => SeoFaqBlock(),
  draw_spotlight: async () =>
    promo(await DrawSpotlightBlock(), { creative_name: "draw_spotlight", creative_slot: "home_draw", promotion_name: "Prize Draw" }),
};

// Default homepage block order (the current section order) — used to seed the
// `home` CMS page and as the render fallback.
export const DEFAULT_HOME_BLOCKS = [
  "home_hero",
  "trust_bar",
  "shop_by_category",
  "membership_value_strip",
  "brand_showcase",
  "clearance_spotlight",
  "featured_products",
  "seo_faq",
  "draw_spotlight",
];
