import { notFound } from "next/navigation";
import Link from "next/link";
import { getProductBySlug, getProductReviews, getProductAttachments, getRelatedProducts, getFeatureFlag, getEffectivePrice, brandService, CHANNEL_ID, getProductBreadcrumbs } from "@/lib/store";
import { getMemberContext } from "@/lib/member";
import { ChevronRight } from "lucide-react";
import { ProductPageClient } from "@/components/product/ProductPageClient";
import { ProductTabs } from "@/components/product/ProductTabs";
import { ProductGrid } from "@/components/product/ProductGrid";
import { BackButton } from "@/components/ui/BackButton";

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) {
    notFound();
  }

  const [reviewsRaw, attachmentsRaw, relatedProducts, brandRow] = await Promise.all([
    getProductReviews(product.id),
    getProductAttachments(product.id),
    getRelatedProducts(product.id, product.categoryIds ?? []),
    product.brandId != null
      ? (brandService.getById(product.brandId) as Promise<{ name?: string | null; slug?: string | null } | null>)
      : Promise.resolve(null),
  ]);

  // Breadcrumb trail scoped to this channel's own category tree. A product's
  // category assignments can span other channels' trees, so resolving through
  // the channel guarantees every crumb links to a category page that exists here.
  const breadcrumbs = (await getProductBreadcrumbs(product.id)) as {
    id: number;
    name: string;
    slug: string;
  }[];

  // Member pricing — design-system model: the member figure is computed for
  // EVERYONE (guests price at the base member tier) so the page can render
  // either the member price or the gold "Join → pay $X" conversion funnel.
  let memberPrice: number | null = null;
  let membershipTeaser: { fromPrice: string | null } | null = null;
  const memberPricingEnabled = await getFeatureFlag("member_pricing_enabled");
  const memberCtx = await getMemberContext();
  const isMember = memberCtx.isMember;

  let memberPriceMap: Record<number, number> = {};
  if (memberPricingEnabled && memberCtx.customerGroupId) {
    membershipTeaser = { fromPrice: memberCtx.planPrice ? parseFloat(memberCtx.planPrice).toFixed(2) : null };

    // Member prices for ALL variants so the client can update on variant change.
    const variants = product.variants ?? [];
    const pricingResults = await Promise.all(
      variants.map((v) => getEffectivePrice(v.id, CHANNEL_ID, memberCtx.customerGroupId))
    );
    for (let i = 0; i < variants.length; i++) {
      const pricing = pricingResults[i];
      if (pricing.salePrice) {
        memberPriceMap[variants[i].id] = parseFloat(pricing.salePrice);
      }
    }
    // Default member price from first variant for initial render
    const defaultVariant = variants[0];
    if (defaultVariant && memberPriceMap[defaultVariant.id] != null) {
      memberPrice = memberPriceMap[defaultVariant.id];
    }
  }

  const reviews = reviewsRaw as {
    id: number;
    rating: number;
    title: string | null;
    text: string | null;
    author_name: string | null;
    created_at: string | Date | null;
  }[];

  const reviewSummary =
    reviews.length > 0
      ? {
          avg: reviews.reduce((s, r) => s + (r.rating ?? 0), 0) / reviews.length,
          count: reviews.length,
        }
      : null;

  // Product + Offer + BreadcrumbList structured data. The Offer price is the
  // visitor's state (member or RRP) expressed INC GST for Google Shopping.
  const offerExPrice = isMember && memberPrice != null ? memberPrice : parseFloat(product.price);
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Product",
        name: product.name,
        sku: product.sku ?? undefined,
        brand: brandRow?.name ? { "@type": "Brand", name: brandRow.name } : undefined,
        image: product.images?.[0]?.urlStandard ?? undefined,
        offers:
          Number.isFinite(offerExPrice) && offerExPrice > 0
            ? {
                "@type": "Offer",
                priceCurrency: "AUD",
                price: (offerExPrice * 1.1).toFixed(2),
                availability:
                  (product.availability ?? "available") === "available"
                    ? "https://schema.org/InStock"
                    : "https://schema.org/OutOfStock",
                url: `https://chefsdepot.com.au/products/${product.urlPath}`,
              }
            : undefined,
        ...(reviewSummary
          ? {
              aggregateRating: {
                "@type": "AggregateRating",
                ratingValue: reviewSummary.avg.toFixed(1),
                reviewCount: reviewSummary.count,
              },
            }
          : {}),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: breadcrumbs.map((b, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: b.name,
          item: `https://chefsdepot.com.au/categories/${b.slug}`,
        })),
      },
    ],
  };

  const attachments = attachmentsRaw as {
    id: number;
    fileName: string;
    url: string;
    label: string | null;
    fileType: string | null;
    fileSize: number | null;
  }[];

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Breadcrumbs */}
      {breadcrumbs.length > 0 ? (
        <nav className="flex flex-wrap items-center gap-1.5 text-sm text-text-muted mb-6">
          <Link href="/products" className="hover:text-text-secondary transition-colors duration-300">Products</Link>
          {breadcrumbs.map((crumb: { id: number; name: string; slug: string }) => (
            <span key={crumb.id} className="flex items-center gap-1.5">
              <ChevronRight className="h-3.5 w-3.5" />
              <Link href={`/categories/${crumb.slug}`} className="hover:text-text-secondary transition-colors duration-300">{crumb.name}</Link>
            </span>
          ))}
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-text-body truncate max-w-[200px]">{product.name}</span>
        </nav>
      ) : (
        <BackButton fallbackHref="/products" fallbackLabel="Back to Products" className="mb-6" />
      )}

      <ProductPageClient
        product={{
          id: product.id,
          name: product.name,
          sku: product.sku,
          price: product.price,
          salePrice: product.salePrice,
          inventoryLevel: product.inventoryLevel ?? 0,
          inventoryTracking: product.inventoryTracking ?? "none",
          availability: product.availability ?? "available",
          descriptionShort: product.descriptionShort,
          images: product.images,
          variants: product.variants,
          options: product.options ?? [],
          optionValues: product.optionValues ?? [],
          variantOptionMappings: product.variantOptionMappings ?? [],
          bulkPricing: product.bulkPricing ?? [],
        }}
        memberPrice={memberPrice}
        memberPriceMap={memberPriceMap}
        isMember={isMember}
        membershipTeaser={membershipTeaser}
        brandName={brandRow?.name ?? null}
        reviewSummary={reviewSummary}
      />

      {/* Brand / category cross-links (design system) */}
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

      {/* Tabbed content section */}
      <ProductTabs
        description={product.description}
        warranty={product.warranty ?? null}
        customFields={product.customFields as Record<string, unknown> | null}
        reviews={reviews}
        attachments={attachments}
        productId={product.id}
      />

      {/* Related Products */}
      {relatedProducts.length > 0 && (
        <div className="mt-12 border-t border-zinc-200 pt-8">
          <h2 className="text-2xl font-bold text-zinc-900 mb-6">Related Products</h2>
          <ProductGrid products={relatedProducts} memberPricingAvailable={memberPricingEnabled} />
        </div>
      )}
    </div>
  );
}
