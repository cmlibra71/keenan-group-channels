import Link from "next/link";
import Image from "next/image";
import { ChevronRight } from "lucide-react";
import type { HomeSection, HomeImage, CategoryTile, ValueBarItem, CustomerLogo } from "@/lib/store";
import { CategoryTileGrid } from "./CategoryTileGrid";
import { ValueBar } from "./ValueBar";
import { CustomerLogos } from "./CustomerLogos";
import { HomepageSpotlight } from "./HomepageSpotlight";
import { ClearanceSpotlight } from "./ClearanceSpotlight";
import { BannerCarousel } from "./BannerCarousel";
import { Ga4Promotion } from "@/components/analytics/Ga4Promotion";

type CarouselData = {
  products: Awaited<ReturnType<typeof import("@/lib/store").getProducts>>["products"];
};

export type HomeSectionsProps = {
  sections: HomeSection[];
  categoryTiles: CategoryTile[];
  categoryTilesHeading?: string;
  valueBarItems: ValueBarItem[];
  customerLogos: { heading?: string; logos?: CustomerLogo[] };
  carousels: Record<string, CarouselData>;
  memberPricingAvailable: boolean;
};

import {
  ImageBanner, LogoStrip, PromoTiles, SplitPromos,
  CategoryButtons, RichText, Testimonials, Tagline,
} from "./HomeSectionParts";

export function HomeSections({
  sections,
  categoryTiles,
  categoryTilesHeading,
  valueBarItems,
  customerLogos,
  carousels,
  memberPricingAvailable,
}: HomeSectionsProps) {
  return (
    <>
      {sections.map((section, i) => {
        switch (section.type) {
          case "category_tiles":
            return (
              <CategoryTileGrid key={i} tiles={categoryTiles} heading={categoryTilesHeading} />
            );
          case "value_bar":
            return valueBarItems.length > 0 ? <ValueBar key={i} items={valueBarItems} /> : null;
          case "customer_logos":
            return (
              <CustomerLogos
                key={i}
                heading={customerLogos.heading}
                logos={customerLogos.logos}
              />
            );
          case "image_banner":
            return (
              <Ga4Promotion key={i} promotion={{ creative_name: "image_banner", creative_slot: `home_image_banner_${i}`, promotion_name: (("alt" in section && section.alt) || "Image banner") as string }}>
                <ImageBanner {...section} />
              </Ga4Promotion>
            );
          case "banner_carousel":
            return (
              <Ga4Promotion key={i} promotion={{ creative_name: "banner_carousel", creative_slot: `home_banner_carousel_${i}`, promotion_name: "Banner carousel" }}>
                <BannerCarousel slides={section.slides} variant={section.variant} />
              </Ga4Promotion>
            );
          case "logo_strip":
            return <LogoStrip key={i} heading={section.heading} logos={section.logos} />;
          case "promo_tiles":
            return (
              <Ga4Promotion key={i} promotion={{ creative_name: "promo_tiles", creative_slot: `home_promo_tiles_${i}`, promotion_name: "Promo tiles" }}>
                <PromoTiles tiles={section.tiles} />
              </Ga4Promotion>
            );
          case "split_promos":
            return (
              <Ga4Promotion key={i} promotion={{ creative_name: "split_promos", creative_slot: `home_split_promos_${i}`, promotion_name: "Split promos" }}>
                <SplitPromos items={section.items} />
              </Ga4Promotion>
            );
          case "category_buttons":
            return (
              <CategoryButtons
                key={i}
                heading={section.heading}
                subheading={section.subheading}
                buttons={section.buttons}
              />
            );
          case "rich_text":
            return (
              <RichText
                key={i}
                heading={section.heading}
                body={section.body}
                cta_text={section.cta_text}
                cta_href={section.cta_href}
              />
            );
          case "testimonials":
            return <Testimonials key={i} heading={section.heading} images={section.images} />;
          case "tagline":
            return <Tagline key={i} text={section.text} />;
          case "product_carousel": {
            const data = carousels[section.category_slug];
            if (!data || data.products.length === 0) return null;
            if (section.variant === "clearance") {
              return (
                <ClearanceSpotlight
                  key={i}
                  products={data.products}
                  heading={section.heading}
                  eyebrow={section.subheading}
                />
              );
            }
            return (
              <HomepageSpotlight
                key={i}
                heading={section.heading}
                subheading={section.subheading}
                ctaHref={section.cta_href ?? null}
                ctaLabel={section.cta_text}
                hero={section.hero}
                products={data.products}
                memberPricingAvailable={memberPricingAvailable}
              />
            );
          }
          default:
            return null;
        }
      })}
    </>
  );
}
