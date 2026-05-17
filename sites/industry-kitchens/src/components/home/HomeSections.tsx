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

// ---- inline section pieces -------------------------------------------------

function ImageBanner({
  image_url,
  width,
  height,
  href,
  alt,
  hover_image_url,
}: HomeImage & { hover_image_url?: string }) {
  const base =
    width && height ? (
      <Image
        src={image_url}
        alt={alt || ""}
        width={width}
        height={height}
        sizes="(max-width: 1280px) 100vw, 1280px"
        className="w-full h-auto"
      />
    ) : (
      <div className="relative w-full aspect-[3/1]">
        <Image src={image_url} alt={alt || ""} fill sizes="100vw" className="object-contain" />
      </div>
    );
  const content = (
    <div className="group relative overflow-hidden rounded-lg border border-zinc-200 bg-white">
      <div className={hover_image_url ? "transition-opacity duration-300 group-hover:opacity-0" : ""}>
        {base}
      </div>
      {hover_image_url && (
        <div className="absolute inset-0 flex items-center justify-center bg-white p-6 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <Image
            src={hover_image_url}
            alt={alt || ""}
            fill
            sizes="(max-width: 1280px) 100vw, 1280px"
            className="object-contain p-6"
          />
        </div>
      )}
    </div>
  );
  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
      {href ? (
        <Link href={href} className="block">
          {content}
        </Link>
      ) : (
        content
      )}
    </section>
  );
}

function LogoStrip({ heading, logos }: { heading?: string; logos: HomeImage[] }) {
  if (!logos?.length) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {heading && (
        <h2 className="mb-6 text-center text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">
          {heading}
        </h2>
      )}
      <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-6 sm:gap-x-14">
        {logos.map((logo, i) => {
          const inner = (
            <span className="flex h-12 w-32 sm:h-16 sm:w-44 items-center justify-center">
              <Image
                src={logo.image_url}
                alt={logo.alt || ""}
                width={logo.width || 220}
                height={logo.height || 90}
                className="max-h-full max-w-full w-auto h-auto object-contain opacity-90 transition-opacity hover:opacity-100"
              />
            </span>
          );
          return logo.href ? (
            <Link key={i} href={logo.href} aria-label={logo.alt}>
              {inner}
            </Link>
          ) : (
            <span key={i}>{inner}</span>
          );
        })}
      </div>
    </section>
  );
}

function PromoTiles({
  tiles,
}: {
  tiles: ({ label: string; href: string } & HomeImage)[];
}) {
  if (!tiles?.length) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {tiles.map((tile, i) => (
          <Link
            key={i}
            href={tile.href}
            className="group flex flex-col overflow-hidden rounded-md border border-zinc-200 bg-white shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="relative aspect-[5/2] bg-zinc-100">
              <Image
                src={tile.image_url}
                alt={tile.label}
                fill
                sizes="(max-width: 640px) 100vw, 50vw"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
            </div>
            <div className="flex items-center justify-center border-t border-zinc-200 bg-zinc-50 px-3 py-3">
              <span className="text-center text-sm sm:text-base font-semibold text-zinc-800 transition-colors group-hover:text-[#D94B2B]">
                {tile.label}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function SplitPromos({
  items,
}: {
  items: {
    heading: string;
    subheading?: string;
    image_url?: string;
    cta_text?: string;
    cta_href?: string;
  }[];
}) {
  if (!items?.length) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map((item, i) => (
          <Link
            key={i}
            href={item.cta_href || "#"}
            className="group flex flex-col overflow-hidden rounded-md border border-zinc-200 bg-white shadow-sm hover:shadow-md transition-shadow"
          >
            {item.image_url && (
              <div className="relative aspect-[16/9] bg-zinc-100">
                <Image
                  src={item.image_url}
                  alt={item.heading}
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-cover"
                />
              </div>
            )}
            <div className="p-6 text-center">
              <h3 className="text-lg font-bold uppercase tracking-wide text-zinc-900">
                {item.heading}
              </h3>
              {item.subheading && (
                <p className="mt-1.5 text-sm text-zinc-600">{item.subheading}</p>
              )}
              {item.cta_text && (
                <span className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-[#D94B2B] px-4 py-2 text-xs font-bold uppercase tracking-wide text-white transition-colors group-hover:bg-[#C73629]">
                  {item.cta_text}
                  <ChevronRight className="h-3.5 w-3.5" />
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function CategoryButtons({
  heading,
  subheading,
  buttons,
}: {
  heading?: string;
  subheading?: string;
  buttons: ({ label: string; href: string } & Partial<HomeImage>)[];
}) {
  if (!buttons?.length) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
      {heading && (
        <h2 className="text-center text-2xl sm:text-3xl font-bold text-zinc-900">{heading}</h2>
      )}
      {subheading && (
        <p className="mt-2 text-center text-sm uppercase tracking-wide text-zinc-500">
          {subheading}
        </p>
      )}
      <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {buttons.map((btn, i) => (
          <Link
            key={i}
            href={btn.href}
            className="group flex flex-col overflow-hidden rounded-md border border-zinc-200 bg-white hover:shadow-md transition-shadow"
          >
            <div className="relative aspect-[4/3] bg-zinc-100">
              {btn.image_url && (
                <Image
                  src={btn.image_url}
                  alt={btn.label}
                  fill
                  sizes="(max-width: 768px) 50vw, 25vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
              )}
            </div>
            <div className="flex items-center justify-center border-t border-zinc-200 bg-white px-2 py-3">
              <span className="text-center text-sm font-semibold text-zinc-800 transition-colors group-hover:text-[#D94B2B]">
                {btn.label}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function RichText({
  heading,
  body,
  cta_text,
  cta_href,
}: {
  heading?: string;
  body: string;
  cta_text?: string;
  cta_href?: string;
}) {
  return (
    <section className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12 text-center">
      {heading && <h2 className="text-2xl sm:text-3xl font-bold text-zinc-900">{heading}</h2>}
      <p className="mt-4 text-zinc-600 leading-relaxed">{body}</p>
      {cta_text && cta_href && (
        <Link
          href={cta_href}
          className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-[#D94B2B] hover:text-[#C73629]"
        >
          {cta_text}
          <ChevronRight className="h-4 w-4" />
        </Link>
      )}
    </section>
  );
}

function Testimonials({ heading, images }: { heading?: string; images: HomeImage[] }) {
  if (!images?.length) return null;
  return (
    <section className="bg-zinc-50 border-y border-zinc-200">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-14">
        {heading && (
          <h2 className="mb-8 text-center text-2xl sm:text-3xl font-bold text-zinc-900">
            {heading}
          </h2>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {images.map((img, i) => (
            <div
              key={i}
              className="rounded-lg border border-zinc-200 bg-white p-3 sm:p-4 shadow-sm"
            >
              <Image
                src={img.image_url}
                alt={img.alt || "Customer review"}
                width={img.width || 1140}
                height={img.height || 200}
                sizes="(max-width: 768px) 100vw, 560px"
                className="w-full h-auto"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Tagline({ text }: { text: string }) {
  return (
    <section className="bg-zinc-100 border-y border-zinc-200">
      <p className="mx-auto max-w-7xl px-4 py-5 text-center text-sm font-semibold text-zinc-700">
        {text}
      </p>
    </section>
  );
}

// ---- renderer --------------------------------------------------------------

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
            return <ImageBanner key={i} {...section} />;
          case "banner_carousel":
            return (
              <BannerCarousel key={i} slides={section.slides} variant={section.variant} />
            );
          case "logo_strip":
            return <LogoStrip key={i} heading={section.heading} logos={section.logos} />;
          case "promo_tiles":
            return <PromoTiles key={i} tiles={section.tiles} />;
          case "split_promos":
            return <SplitPromos key={i} items={section.items} />;
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
