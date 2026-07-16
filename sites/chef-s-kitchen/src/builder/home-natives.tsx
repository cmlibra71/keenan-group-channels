"use client";
import Link from "next/link";
import Image from "next/image";
import { Crown, ArrowRight, ChevronRight } from "lucide-react";
import { StatsBanner } from "@/components/home/StatsBanner";
import { ProductGridClient, type GridProduct } from "@/components/product/ProductGridClient";

// ============================================================================
// CLIENT views of the homepage sections that were previously inlined in the
// async home blocks (home-blocks.tsx) — markup copied EXACTLY so the node
// home is pixel-identical. Data arrives via props (the route prefetches);
// nothing here self-fetches. Sections that already had presentational
// components (TrustBar, BrandShowcase, ClearanceSpotlight, SeoFaq,
// DrawSpotlight, MembershipValueStrip) are used directly by BuilderHomePage.
// ============================================================================

export interface HeroPrize {
  name: string;
  imageUrl: string | null;
  value: string | null;
}
export interface HeroDraw {
  scheduled_at: string | null;
}

export interface HomeHeroData {
  membership: boolean;
  eyebrow: string;
  headline: string;
  headlineEmphasis: string;
  subheadline: string;
  ctaText: string;
  ctaHref: string;
  cta2Text: string;
  cta2Href: string;
  planBenefits: string[];
  featuredPrize: HeroPrize | null;
  featuredDraw: HeroDraw | null;
  productCount: number;
  brandCount: number;
}

function HeroSidePanel({
  planBenefits,
  featuredPrize,
  featuredDraw,
  productCount,
  brandCount,
}: Pick<HomeHeroData, "planBenefits" | "featuredPrize" | "featuredDraw" | "productCount" | "brandCount">) {
  return (
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
  );
}

export function HomeHeroView(d: HomeHeroData) {
  if (d.membership) {
    return (
      <section className="relative flex min-h-[520px] items-center overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('/images/hero-bg.webp')" }} />
        <div className="absolute inset-0 bg-[linear-gradient(100deg,rgba(20,22,20,.78)_0%,rgba(28,30,28,.5)_50%,rgba(20,22,20,.62)_100%)]" />
        <div className="relative z-10 container-page w-full py-10">
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
            <div className="glass self-center p-8 text-white lg:p-10">
              <p className="mb-[18px] text-[11.5px] font-bold uppercase tracking-[0.16em] text-white/85">
                {d.eyebrow}
              </p>
              <h1 className="hero-title text-white">
                {d.headline} <em className="not-italic text-member-bright">{d.headlineEmphasis}</em>
              </h1>
              <p className="mt-[18px] max-w-[44ch] text-base leading-[1.55] text-white/[0.88]">
                {d.subheadline}
              </p>
              <div className="mt-[26px] flex flex-wrap gap-3">
                <Link href={d.ctaHref} className="btn-primary">
                  {d.ctaText}
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href={d.cta2Href} className="btn-glass">
                  {d.cta2Text}
                </Link>
              </div>
            </div>
            <HeroSidePanel
              planBenefits={d.planBenefits}
              featuredPrize={d.featuredPrize}
              featuredDraw={d.featuredDraw}
              productCount={d.productCount}
              brandCount={d.brandCount}
            />
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
            {d.eyebrow}
          </p>
          <h1 className="hero-title text-white">{d.headline}</h1>
          <p className="mt-[18px] max-w-[44ch] text-base leading-[1.55] text-white/[0.88]">
            {d.subheadline}
          </p>
          <Link href={d.ctaHref} className="btn-primary mt-[26px]">
            {d.ctaText}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

export interface CategoryTile {
  id: number;
  name: string;
  slug: string;
  image_url?: string | null;
  childCount: number;
}

export function ShopByCategoryView({
  categories,
  eyebrow,
  heading,
}: {
  categories: CategoryTile[];
  eyebrow: string;
  heading: string;
}) {
  if (categories.length === 0) return null;
  return (
    <section className="container-page section-padding">
      <div className="mb-10 flex items-end justify-between">
        <div>
          <p className="eyebrow mb-3">{eyebrow}</p>
          <h2 className="section-title">{heading}</h2>
        </div>
        <Link href="/categories" className="hidden items-center gap-1.5 text-sm font-semibold text-accent transition-colors hover:text-accent-hover sm:inline-flex">
          View All
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {categories.slice(0, 8).map((category) => (
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
                {category.childCount > 0 && (
                  <span className="text-[11.5px] text-steel-500">
                    {category.childCount} categor{category.childCount === 1 ? "y" : "ies"}
                  </span>
                )}
              </div>
              <span className="grid h-[30px] w-[30px] place-items-center rounded-full bg-brand-tint text-brand-deep transition-colors duration-200 group-hover:bg-accent group-hover:text-white">
                <ChevronRight className="h-3.5 w-3.5" />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function FeaturedProductsView({
  products,
  memberPricingAvailable,
  pricing,
  eyebrow,
  heading,
}: {
  products: GridProduct[];
  memberPricingAvailable: boolean;
  pricing: { memberPriceMap?: Record<number, number>; isMember?: boolean; planPrice?: string | null };
  eyebrow: string;
  heading: string;
}) {
  return (
    <section className="container-page section-padding">
      <div className="flex items-end justify-between mb-10">
        <div>
          <p className="eyebrow mb-3">{eyebrow}</p>
          <h2 className="section-title">{heading}</h2>
        </div>
        <Link href="/products?filter=featured" className="hidden sm:inline-flex items-center gap-1.5 nav-link">
          View All
          <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
      <ProductGridClient products={products} memberPricingAvailable={memberPricingAvailable} {...pricing} />
    </section>
  );
}
