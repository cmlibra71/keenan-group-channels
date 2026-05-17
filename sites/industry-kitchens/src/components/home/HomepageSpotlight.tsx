import Link from "next/link";
import Image from "next/image";
import { ChevronRight } from "lucide-react";
import { ProductGrid } from "@/components/product/ProductGrid";
import type { HomeImage } from "@/lib/store";

type SpotlightProduct = Parameters<typeof ProductGrid>[0]["products"][number];

export function HomepageSpotlight({
  heading,
  subheading,
  ctaHref,
  ctaLabel = "View all",
  hero,
  products,
  memberPricingAvailable = false,
}: {
  heading: string;
  subheading?: string;
  ctaHref?: string | null;
  ctaLabel?: string;
  hero?: HomeImage;
  products: SpotlightProduct[];
  memberPricingAvailable?: boolean;
}) {
  if (products.length === 0) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
      {hero ? (
        <div className="mb-8 grid grid-cols-1 md:grid-cols-2 overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <div className="relative aspect-[4/3] md:aspect-auto md:min-h-[22rem] bg-zinc-100">
            <Image
              src={hero.image_url}
              alt={hero.alt || heading}
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
            />
          </div>
          <div className="flex flex-col justify-center p-8 text-center sm:p-12 md:text-left">
            <h2 className="text-2xl sm:text-3xl font-bold uppercase tracking-wide text-zinc-900">
              {heading}
            </h2>
            {subheading && <p className="mt-3 text-zinc-600">{subheading}</p>}
            {ctaHref && (
              <Link
                href={ctaHref}
                className="mt-6 inline-flex w-fit items-center gap-2 self-center rounded-md bg-[#D94B2B] px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-white transition-colors hover:bg-[#C73629] md:self-start"
              >
                {ctaLabel}
                <ChevronRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-end justify-between mb-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-zinc-900">{heading}</h2>
          {ctaHref && (
            <Link
              href={ctaHref}
              className="hidden sm:inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 hover:text-zinc-900 transition-colors"
            >
              {ctaLabel}
              <ChevronRight className="h-3 w-3" />
            </Link>
          )}
        </div>
      )}
      <ProductGrid products={products} memberPricingAvailable={memberPricingAvailable} />
    </section>
  );
}
