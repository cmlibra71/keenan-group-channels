import { notFound } from "next/navigation";
import { draftMode } from "next/headers";
import Link from "next/link";
import { getProductBySlug, getProductReviews, getProductAttachments, getRelatedProducts, getFeatureFlag, getEffectivePrice, brandService, CHANNEL_ID, getProductBreadcrumbs, shouldSuppressCatalogSalePrice, getCmsPage, getCmsTemplate } from "@/lib/store";
import type { RenderContext } from "@keenan/services";
import { getMemberContext, getListingPricing } from "@/lib/member";
import { ChevronRight } from "lucide-react";
import { BackButton } from "@/components/ui/BackButton";
import { BlockRenderer, type RenderedBlock } from "@/blocks/BlockRenderer";
import { getProductPageData, getNamedStyles } from "@/lib/store";
import { BuilderProductPage } from "@/builder/BuilderProductPage";
import { SEED_PRODUCT_TREE } from "@/builder/seeds/product";
import { ViewedProductTracker } from "@/components/analytics/ViewedProductTracker";
import {
  ProductBuyBox,
  ProductLinks,
  ProductTabsBlock,
  ProductRelated,
  DEFAULT_PRODUCT_BLOCKS,
  type ProductPageCtx,
} from "@/blocks/product-page-blocks";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Product not found" };
  const name = (product.name as string) || "Product";
  const descRaw =
    (product.metaDescription as string) ||
    (product.descriptionShort as string) ||
    `${name} — professional kitchen equipment at Chef's Depot.`;
  const description = descRaw.replace(/<[^>]*>/g, "").trim().slice(0, 160);
  const imgs = product.images as Array<{ url?: string | null }> | undefined;
  const image = Array.isArray(imgs) && imgs[0]?.url ? imgs[0].url : undefined;
  return {
    title: name,
    description,
    openGraph: {
      title: name,
      description,
      type: "website",
      images: image ? [{ url: image }] : undefined,
    },
  };
}

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
  // Bulk-pricing tiers are shared-catalog public pricing (like sale_price); on a
  // cost-plus member channel they aren't charged, so suppress the display rather
  // than promise a price the cart won't honour.
  const suppressCatalogPricing = await shouldSuppressCatalogSalePrice();
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

  const relatedPricing = await getListingPricing(relatedProducts);

  const attachments = attachmentsRaw as {
    id: number;
    fileName: string;
    url: string;
    label: string | null;
    fileType: string | null;
    fileSize: number | null;
  }[];

  // Editable CMS content zones shown on every product page (global product
  // template). Empty unless set — so the page renders exactly as before.
  const { isEnabled: draft } = await draftMode();
  const productCms = await getCmsPage("__product__", draft).catch(() => null);
  // Product page content is the __product__ template's `main` block list (editable
  // in Pages & Content). Defaults to buy-box + links + tabs + related, so an
  // unedited template renders exactly as before. System blocks get the live context.
  const prodBlocks = ((productCms?.blocks as unknown as RenderedBlock[]) ?? []).filter(
    (b) => b.region === "main"
  );
  const blocks: RenderedBlock[] =
    prodBlocks.length > 0 ? prodBlocks : (DEFAULT_PRODUCT_BLOCKS as unknown as RenderedBlock[]);

  const ctx: ProductPageCtx = {
    buybox: {
      product: {
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
        bulkPricing: suppressCatalogPricing ? [] : (product.bulkPricing ?? []),
      },
      memberPrice,
      memberPriceMap,
      isMember,
      membershipTeaser,
      brandName: brandRow?.name ?? null,
      reviewSummary,
    },
    links: {
      brandRow:
        brandRow?.name && brandRow?.slug ? { name: brandRow.name, slug: brandRow.slug } : null,
      breadcrumbs,
    },
    tabs: {
      description: product.description,
      warranty: product.warranty ?? null,
      customFields: product.customFields as Record<string, unknown> | null,
      reviews,
      attachments,
      productId: product.id,
    },
    related: {
      products: relatedProducts,
      memberPricingAvailable: memberPricingEnabled,
      pricing: relatedPricing,
    },
  };

  // ═══ Site Builder node-tree path (flag: node_product_template_enabled) ═══
  // Precedence: nodes → v2 blocks → v1 → legacy. One aggregate read feeds the
  // NodeRenderer; the route stays SEO/JSON-LD owner. Env CMS_NODES_FORCE=1 for
  // local testing (never in prod). Phase 1 uses the seed tree; a stored
  // node_tree template supersedes it once authored.
  const forceNodes = process.env.CMS_NODES_FORCE === "1";
  if (forceNodes || (await getFeatureFlag("node_product_template_enabled"))) {
    const payload = await getProductPageData(slug, {
      memberContext: {
        customerGroupId: memberCtx.customerGroupId,
        isMember,
        planPrice: membershipTeaser?.fromPrice ?? null,
      },
      draft,
    }).catch(() => null);
    // The AUTHORED tree wins: the product template doc (builder_kind='nodes' —
    // published version live, draft in preview). Seed only as fallback.
    const nodesDoc = (await getCmsTemplate("product", draft).catch(() => null)) as {
      builder_kind?: string;
      node_tree?: unknown;
    } | null;
    const storedTree =
      nodesDoc?.builder_kind === "nodes" && nodesDoc.node_tree
        ? (nodesDoc.node_tree as typeof SEED_PRODUCT_TREE)
        : null;
    const namedStyles = await getNamedStyles().catch(() => ({}));
    if (payload) {
      return (
        <div>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
          />
          <ViewedProductTracker
            product={{
              id: product.id,
              sku: product.sku,
              name: product.name,
              price:
                product.salePrice != null
                  ? parseFloat(String(product.salePrice))
                  : product.price != null
                    ? parseFloat(String(product.price))
                    : null,
              imageUrl:
                ((product.images as Array<Record<string, unknown>> | undefined)?.[0]?.urlStandard as string) ?? null,
              categories: breadcrumbs.map((c: { name: string }) => c.name),
              brand: brandRow?.name ?? null,
            }}
          />
          <BuilderProductPage tree={storedTree ?? SEED_PRODUCT_TREE} payload={payload} namedStyles={namedStyles} />
        </div>
      );
    }
  }

  // ═══ CMS product TEMPLATE path (kill switch: flag off → legacy) ═══
  // The whole page as a block document (breadcrumbs / slots / buybox / links /
  // tabs / related); this route stays the data + SEO owner — JSON-LD stays
  // here, and the heavy queries above feed the blocks via RenderContext extras.
  // CMS v2 local-testing override: render the v2 decomposed composition
  // (schema-default sub-blocks) instead of the stored template doc. Env-only —
  // never set in production; lets the v2 path be exercised without touching
  // the shared database.
  const forceV2 = process.env.CMS_V2_FORCE === "1";
  if (forceV2 || (await getFeatureFlag("cms_product_template_enabled"))) {
    const template = forceV2
      ? {
          blocks: [
            { block_type: "breadcrumbs", region: "main", props: {} },
            { block_type: "product_overview", region: "main", props: {} },
            { block_type: "product_links", region: "main", props: {} },
            { block_type: "product_tabs", region: "main", props: {} },
            { block_type: "product_related", region: "main", props: {} },
          ] as unknown as RenderedBlock[],
        }
      : await getCmsTemplate("product", draft).catch(() => null);
    if (template && template.blocks.length > 0) {
      const context: RenderContext = {
        draft,
        record: {
          kind: "product",
          product: product as unknown as Record<string, unknown>,
          extras: {
            reviews,
            reviewSummary,
            attachments,
            relatedProducts,
            relatedPricing: relatedPricing as unknown as Record<string, unknown>,
            brandRow,
            breadcrumbs,
            memberPrice,
            memberPriceMap,
            isMember,
            membershipTeaser,
            memberPricingEnabled,
            suppressCatalogPricing,
          },
        },
      };
      return (
        <div>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
          />
          <ViewedProductTracker
            product={{
              id: product.id,
              sku: product.sku,
              name: product.name,
              price:
                product.salePrice != null
                  ? parseFloat(String(product.salePrice))
                  : product.price != null
                    ? parseFloat(String(product.price))
                    : null,
              imageUrl:
                ((product.images as Array<Record<string, unknown>> | undefined)?.[0]?.urlStandard as string) ??
                ((product.images as Array<Record<string, unknown>> | undefined)?.[0]?.url_standard as string) ??
                null,
              categories: breadcrumbs.map((c: { name: string }) => c.name),
              brand: brandRow?.name ?? null,
            }}
          />
          <BlockRenderer
            blocks={template.blocks as unknown as RenderedBlock[]}
            draft={draft}
            context={context}
          />
        </div>
      );
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <ViewedProductTracker
        product={{
          id: product.id,
          sku: product.sku,
          name: product.name,
          price:
            product.salePrice != null
              ? parseFloat(String(product.salePrice))
              : product.price != null
                ? parseFloat(String(product.price))
                : null,
          imageUrl:
            ((product.images as Array<Record<string, unknown>> | undefined)?.[0]?.urlStandard as string) ??
            ((product.images as Array<Record<string, unknown>> | undefined)?.[0]?.url_standard as string) ??
            null,
          categories: breadcrumbs.map((c: { name: string }) => c.name),
          brand: brandRow?.name ?? null,
        }}
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

      {blocks.map((b, i) => {
        switch (b.block_type) {
          case "product_buybox":
            return <ProductBuyBox key={i} ctx={ctx} />;
          case "product_links":
            return <ProductLinks key={i} ctx={ctx} />;
          case "product_tabs":
            return <ProductTabsBlock key={i} ctx={ctx} />;
          case "product_related":
            return <ProductRelated key={i} ctx={ctx} />;
          default:
            return <BlockRenderer key={i} blocks={[b]} draft={draft} />;
        }
      })}
    </div>
  );
}
