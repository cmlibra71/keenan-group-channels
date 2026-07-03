import Link from "next/link";
import type { ComponentProps } from "react";
import { ProductPageClient } from "@/components/product/ProductPageClient";
import { ProductTabs } from "@/components/product/ProductTabs";
import { ProductGrid } from "@/components/product/ProductGrid";

// Product detail page decomposed into blocks. Each renders the current markup
// verbatim; the page supplies the live product context. Registered so the
// __product__ template shows them as reorderable blocks in Pages & Content.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Crumb = { id: number; name: string; slug: string };

export type ProductPageCtx = {
  buybox: ComponentProps<typeof ProductPageClient>;
  links: { brandRow: { name: string; slug: string } | null; breadcrumbs: Crumb[] };
  tabs: ComponentProps<typeof ProductTabs>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  related: { products: any[]; memberPricingAvailable: boolean; pricing: Record<string, any> };
};

export function ProductBuyBox({ ctx }: { ctx: ProductPageCtx }) {
  return <ProductPageClient {...ctx.buybox} />;
}

export function ProductLinks({ ctx }: { ctx: ProductPageCtx }) {
  const { brandRow, breadcrumbs } = ctx.links;
  return (
    <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
      {brandRow?.name && brandRow?.slug && (
        <Link href={`/brands/${brandRow.slug}`} className="btn-ghost text-[13px]">
          See all {brandRow.name} products →
        </Link>
      )}
      {breadcrumbs.length > 0 && (
        <Link
          href={`/categories/${breadcrumbs[breadcrumbs.length - 1].slug}`}
          className="btn-ghost text-[13px]"
        >
          More {breadcrumbs[breadcrumbs.length - 1].name} →
        </Link>
      )}
    </div>
  );
}

export function ProductTabsBlock({ ctx }: { ctx: ProductPageCtx }) {
  return <ProductTabs {...ctx.tabs} />;
}

export function ProductRelated({ ctx }: { ctx: ProductPageCtx }) {
  const { products, memberPricingAvailable, pricing } = ctx.related;
  if (products.length === 0) return null;
  return (
    <div className="mt-12 border-t border-border pt-8">
      <h2 className="section-title mb-6">You may also like</h2>
      <ProductGrid products={products} memberPricingAvailable={memberPricingAvailable} {...pricing} listId="related_products" listName="Related Products" />
    </div>
  );
}

// Default block order for a product page (used when the template has no blocks).
export const DEFAULT_PRODUCT_BLOCKS = [
  { block_type: "product_buybox" },
  { block_type: "product_links" },
  { block_type: "product_tabs" },
  { block_type: "product_related" },
] as const;
