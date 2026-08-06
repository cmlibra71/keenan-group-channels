import { ProductGrid } from "@/components/product/ProductGrid";
import { HomepageSpotlightShell } from "./HomepageSpotlightShell";
import type { HomeImage } from "@/lib/store";

type SpotlightProduct = Parameters<typeof ProductGrid>[0]["products"][number];

/** Server spotlight — the live homepage's. ProductGrid applies catalog scope
 *  and account prices at read time, which is why this stays a server component. */
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
    <HomepageSpotlightShell
      heading={heading}
      subheading={subheading}
      ctaHref={ctaHref}
      ctaLabel={ctaLabel}
      hero={hero}
    >
      <ProductGrid products={products} memberPricingAvailable={memberPricingAvailable} />
    </HomepageSpotlightShell>
  );
}
