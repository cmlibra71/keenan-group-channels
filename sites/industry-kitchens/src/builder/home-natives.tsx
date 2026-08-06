"use client";
import type { NativeComponents } from "@keenan/services/builder-react";
import type { HomeSection } from "@/lib/store";
import { CategoryTileGrid } from "@/components/home/CategoryTileGrid";
import { ValueBar } from "@/components/home/ValueBar";
import { CustomerLogos } from "@/components/home/CustomerLogos";
import { HomepageSpotlightShell } from "@/components/home/HomepageSpotlightShell";
import { ProductGridClient, type GridProduct } from "@/components/product/ProductGridClient";
import { ClearanceSpotlight } from "@/components/home/ClearanceSpotlight";
import { BannerCarousel } from "@/components/home/BannerCarousel";
import { Ga4Promotion } from "@/components/analytics/Ga4Promotion";
import {
  ImageBanner, LogoStrip, PromoTiles, SplitPromos,
  CategoryButtons, RichText, Testimonials, Tagline,
} from "@/components/home/HomeSectionParts";

// ============================================================================
// Industry Kitchens' homepage sections, as ONE sealed native.
//
// `home-section` renders the section at a given index of the channel's
// configured list — the same switch HomeSections.tsx runs, over the same
// components. The node homepage is therefore pixel-identical to the live one by
// CONSTRUCTION rather than by transcription, which for 18 sections across 12
// types is the difference between a day's work and a week's.
//
// The tree is 18 home-section nodes, and that is what makes the homepage
// editable today: a designer can reorder sections, remove one, or wrap one in
// new layout without anybody porting 300 lines of JSX first. Sections get
// exploded into real nodes later, one at a time, each behind its own parity
// run — the same natives-first route Chefs Depot's homepage took.
//
// An INDEX rather than a copy of the section's data: the list is content the
// channel owns, so a tree that inlined it would go stale the moment someone
// edited the homepage settings.
// ============================================================================

export interface HomeNativeData {
  sections?: HomeSection[];
  categoryTiles?: unknown[];
  categoryTilesHeading?: string;
  valueBarItems?: unknown[];
  customerLogos?: { heading?: string; logos?: unknown[] };
  carousels?: Record<string, { products: unknown[] }>;
  memberPricingAvailable?: boolean;
  memberPriceMap?: Record<number, number>;
  [key: string]: unknown;
}

export function homeSectionNatives(home: HomeNativeData): NativeComponents {
  const sections = (home.sections ?? []) as HomeSection[];
  const carousels = home.carousels ?? {};

  const renderSection = (section: HomeSection | undefined, i: number) => {
    if (!section) return null;
    switch (section.type) {
      case "category_tiles":
        return (
          <CategoryTileGrid
            tiles={(home.categoryTiles ?? []) as never}
            heading={home.categoryTilesHeading}
          />
        );
      case "value_bar":
        return (home.valueBarItems ?? []).length > 0 ? (
          <ValueBar items={(home.valueBarItems ?? []) as never} />
        ) : null;
      case "customer_logos":
        return (
          <CustomerLogos
            heading={home.customerLogos?.heading}
            logos={(home.customerLogos?.logos ?? []) as never}
          />
        );
      case "image_banner":
        return (
          <Ga4Promotion
            promotion={{
              creative_name: "image_banner",
              creative_slot: `home_image_banner_${i}`,
              promotion_name: (("alt" in section && section.alt) || "Image banner") as string,
            }}
          >
            <ImageBanner {...section} />
          </Ga4Promotion>
        );
      case "banner_carousel":
        return (
          <Ga4Promotion
            promotion={{
              creative_name: "banner_carousel",
              creative_slot: `home_banner_carousel_${i}`,
              promotion_name: "Banner carousel",
            }}
          >
            <BannerCarousel slides={section.slides} variant={section.variant} />
          </Ga4Promotion>
        );
      case "logo_strip":
        return <LogoStrip heading={section.heading} logos={section.logos} />;
      case "promo_tiles":
        return (
          <Ga4Promotion
            promotion={{
              creative_name: "promo_tiles",
              creative_slot: `home_promo_tiles_${i}`,
              promotion_name: "Promo tiles",
            }}
          >
            <PromoTiles tiles={section.tiles} />
          </Ga4Promotion>
        );
      case "split_promos":
        return (
          <Ga4Promotion
            promotion={{
              creative_name: "split_promos",
              creative_slot: `home_split_promos_${i}`,
              promotion_name: "Split promos",
            }}
          >
            <SplitPromos items={section.items} />
          </Ga4Promotion>
        );
      case "category_buttons":
        return (
          <CategoryButtons
            heading={section.heading}
            subheading={section.subheading}
            buttons={section.buttons}
          />
        );
      case "rich_text":
        return (
          <RichText
            heading={section.heading}
            body={section.body}
            cta_text={section.cta_text}
            cta_href={section.cta_href}
          />
        );
      case "testimonials":
        return <Testimonials heading={section.heading} images={section.images} />;
      case "tagline":
        return <Tagline text={section.text} />;
      case "product_carousel": {
        const data = carousels[section.category_slug];
        if (!data || data.products.length === 0) return null;
        if (section.variant === "clearance") {
          return (
            <ClearanceSpotlight
              products={data.products as never}
              heading={section.heading}
              eyebrow={section.subheading}
            />
          );
        }
        return (
          <HomepageSpotlightShell
            heading={section.heading}
            subheading={section.subheading}
            ctaHref={section.cta_href ?? null}
            ctaLabel={section.cta_text}
            hero={section.hero}
          >
            {/* The client grid: catalog scope and account prices are applied
                upstream in home-data, because a native renders client-side and
                cannot do a read-time pass. */}
            <ProductGridClient
              products={data.products as GridProduct[]}
              memberPricingAvailable={home.memberPricingAvailable ?? false}
              memberPriceMap={(home.memberPriceMap ?? {}) as Record<number, number>}
            />
          </HomepageSpotlightShell>
        );
      }
      default:
        return null;
    }
  };

  return {
    "home-section": (props: Record<string, unknown>) => {
      const i = Number(props.index ?? -1);
      return renderSection(sections[i], i);
    },
  };
}
