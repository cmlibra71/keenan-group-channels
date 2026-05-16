import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ProductGrid } from "@/components/product/ProductGrid";

type SpotlightProduct = Parameters<typeof ProductGrid>[0]["products"][number];

export function HomepageSpotlight({
  heading,
  ctaHref,
  ctaLabel = "View all",
  products,
  memberPricingAvailable = false,
}: {
  heading: string;
  ctaHref?: string | null;
  ctaLabel?: string;
  products: SpotlightProduct[];
  memberPricingAvailable?: boolean;
}) {
  if (products.length === 0) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
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
      <ProductGrid products={products} memberPricingAvailable={memberPricingAvailable} />
    </section>
  );
}
