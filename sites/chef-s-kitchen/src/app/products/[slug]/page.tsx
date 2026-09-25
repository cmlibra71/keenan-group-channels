import { notFound } from "next/navigation";
import { redirectIfMapped } from "@/lib/redirect-seam";
import { draftMode, headers } from "next/headers";
import Link from "next/link";
import { getProductBySlug, getProductChannelSeo, getProductReviews, getProductAttachments, getProductVideos, getRelatedProducts, getFeatureFlag, getEffectivePrice, getMemberSavingsPctMap, brandService, CHANNEL_ID, getProductBreadcrumbs, shouldSuppressCatalogSalePrice, getCmsPage, getCmsTemplate } from "@/lib/store";
import type { RenderContext } from "@keenan/services";
import { getMemberContext, getListingPricing, applyAccountPrices } from "@/lib/member";
import { assertProductVisible, applyCatalogScope } from "@/lib/catalog-scope";
import { ChevronRight } from "lucide-react";
import { ProductOfferTiers } from "@/components/product/ProductOfferTiers";
import { BackButton } from "@/components/ui/BackButton";
import { BlockRenderer, type RenderedBlock } from "@/blocks/BlockRenderer";
import { renderProductNodeBranch } from "@/builder/product-node-branch";
import { readProductKit } from "@/lib/product-kit";
import { priceKitComponents } from "@/lib/pricing/kit-components";
import { readProductAddons } from "@keenan/services/product-addons";
import { readOptionValueOrder } from "@keenan/services/product-option-order";
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
import { productPageSeo } from "@/lib/product-seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Product not found" };
  // Chefs Depot's OWN title and description first (card CfnjZikj), then the fallbacks —
  // never the shared wording that names Industry Kitchens. See lib/product-seo.ts.
  const own = await getProductChannelSeo(product.id as number);
  const { title: name, description } = productPageSeo(product, own);
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
  const cachedProduct = await getProductBySlug(slug);

  if (!cachedProduct) {
    // Retired/renamed product URLs redirect (url_redirects) instead of 404ing.
    await redirectIfMapped(`/products/${slug}`);
    notFound();
  }

  // L2 — per-account Product Restrictions + group∩contact category access. A product exclusive to
  // another account (or outside this viewer's category access) must be UNREACHABLE, not merely
  // absent from listings: a directly-navigated slug 404s. `categoryIds` come free with the cached
  // row, so this costs no extra query.
  await assertProductVisible(cachedProduct as { id: number; categoryIds?: number[] | null });

  // Per-account product prices override EVERY other price. The cached product row is SHARED by all
  // shoppers, so the account's price is overlaid onto a copy at read time (never into the cache).
  const [product] = await applyAccountPrices([cachedProduct], { bundleBuild: false });

  // Reviews are PROJECTED BEFORE THEY ARE AWAITED. `getProductReviews` returns the
  // whole `product_reviews` row — `author_email` (stamped on every signed-in
  // reviewer since card qxVqy5Dn), `contact_id`, `customer_id`, the moderation
  // status — and a dev build serialises every AWAITED value into the page, so a
  // cast or a `.map()` after the await strips nothing: the raw row is already in
  // the flight payload by then (measured on this page 2026-09-16, review id 89's
  // whole row with `author_email` and `contact_id` in it). Projecting on the
  // PROMISE means nothing unprojected is ever awaited here, and the rows handed to
  // `ProductTabs` ("use client") and to `RenderContext.extras` carry only the six
  // fields this page renders. (PRODUCT-BRIEF §3: on a customer-facing surface,
  // load only what you render; register rule owned by card BIig1Zo1.)
  const [reviews, attachmentsRaw, videos, relatedRaw, brandRow] = await Promise.all([
    getProductReviews(product.id).then(publicReviews),
    getProductAttachments(product.id),
    getProductVideos(product.id),
    getRelatedProducts(product.id, product.categoryIds ?? []),
    product.brandId != null
      ? (brandService.getById(product.brandId) as Promise<{ name?: string | null; slug?: string | null } | null>)
      : Promise.resolve(null),
  ]);

  // Related/upsell rail: hidden products are dropped at the SOURCE, so they cannot reach the grid,
  // the builder payload or any serialized props.
  const relatedProducts = await applyAccountPrices(await applyCatalogScope(relatedRaw));

  // Breadcrumb trail scoped to this channel's own category tree. A product's
  // category assignments can span other channels' trees, so resolving through
  // the channel guarantees every crumb links to a category page that exists here.
  const breadcrumbs = (await getProductBreadcrumbs(product.id)) as {
    id: number;
    name: string;
    slug: string;
  }[];

  // Member pricing. Only an active member (or a B2B account) resolves a price
  // here — getMemberContext hands non-members no pricing group, so no member
  // figure is computed for them and none can reach the page. Non-members get
  // `teaserSavingsPct` instead: a rounded percentage, never a price.
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
  // "Join from $X/mo" is a public, channel-wide figure — it must render for the
  // people we are trying to convert, who by definition have no member price.
  membershipTeaser = memberCtx.planPrice
    ? { fromPrice: parseFloat(memberCtx.planPrice).toFixed(2) }
    : null;
  if ((memberPricingEnabled && memberCtx.customerGroupId) || memberCtx.accountId) {

    // Member prices for ALL variants so the client can update on variant change. The account is
    // threaded in so its contract price short-circuits the member / cost-plus price.
    //
    // The member's SHARE on the price scale rides along too (card gk23c1VK), so this legacy /
    // CMS-template path prices a reviewed member exactly as the node path and the cart do. Without
    // it the engine priced them at share 0 (M) here while the cart charged their share price —
    // two of our screens stating two prices for one line. Null (and harmless) with the scale off.
    const variants = product.variants ?? [];
    const pricingResults = await Promise.all(
      variants.map((v) =>
        getEffectivePrice(
          v.id,
          CHANNEL_ID,
          memberCtx.customerGroupId,
          1,
          memberCtx.accountId,
          null,
          memberCtx.ladderShare ?? null
        )
      )
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

  // What membership would save on THIS product, for people who aren't members —
  // a rounded percentage resolved server-side, with no price attached. This is
  // what keeps the join funnel alive now that non-members have no member price.
  const teaserSavingsPct =
    !isMember && memberCtx.teaserCustomerGroupId
      ? (await getMemberSavingsPctMap(
          [{ id: product.id, price: product.price as string | null }],
          memberCtx.teaserCustomerGroupId
        ))[product.id] ?? 0
      : 0;


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

  // A kit, read ONCE, and — for a bundle — what each component costs THIS shopper, ex GST,
  // through the cart's own pricing (card Tc5ekvD6), so the page prints what the cart charges.
  // Both renderers below read the same pair; every other product costs one no-op parse.
  const productKit = readProductKit(product.metafields);
  const kitPrices = await priceKitComponents(productKit);

  // Editable CMS content zones shown on every product page (global product
  // template). Empty unless set — so the page renders exactly as before.
  const { isEnabled } = await draftMode();
  const draft = isEnabled || (await headers()).get("x-kg-json") === "1";
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
        // Card 59ruI8uJ — the group-wide Item ID, printed above the SKU. Null = no line.
        itemRef: (product.itemRef as string | null | undefined) ?? null,
        price: product.price,
        salePrice: product.salePrice,
        inventoryLevel: product.inventoryLevel ?? 0,
        inventoryTracking: product.inventoryTracking ?? "none",
        // Per-product buying controls (card 7vu2iEEZ). Unset reads as today's behaviour.
        backorderPolicy: product.backorderPolicy ?? null,
        restrictAddToQuote: product.restrictAddToQuote === true,
        restrictAddToCart: product.restrictAddToCart === true,
        hidePrice: product.hidePrice === true,
        availability: product.availability ?? "available",
        descriptionShort: product.descriptionShort,
        images: product.images,
        videos,
        variants: product.variants,
        options: product.options ?? [],
        optionValues: product.optionValues ?? [],
        variantOptionMappings: product.variantOptionMappings ?? [],
        // Belt AND braces on a money surface: the shared strip already empties this on
        // Chef's Depot (`getProductBySlug` -> `stripSuppressedCatalogPricing` in
        // @keenan/services, card Q9hRTbKO). Kept local as well, because a Bulk Pricing
        // table the cart refuses to charge is the defect this page must never show.
        bulkPricing: suppressCatalogPricing ? [] : (product.bulkPricing ?? []),
        // Paid optional extras (card 0CDcCYmO / KvLJOAON), read off the same portal-owned
        // metafields bag `kit` below comes from. Without this the legacy renderer's own
        // `<ProductAddons />` has nothing to draw and its buy controls carry no picks — and
        // because `node_product_template_enabled` is a one-click operator setting on
        // Storefront -> Pages (card BNtsJACK), leaving it out would mean Chefs Depot loses
        // every extras panel the moment that switch is turned off while Industry Kitchens
        // keeps its own. Two storefronts must never read the same product differently.
        // The node path reads the same field out of its own payload.
        addons: readProductAddons(product.metafields),
        // Card VNh9DdYd — the order STAFF authored for this product's variation choices, read
        // from the same portal-owned metafields bag. Null when nobody has authored one, and then
        // `orderOptionValues` derives the order from the product's own combinations.
        optionValueOrder: readOptionValueOrder(product.metafields),
      },
      memberPrice,
      memberPriceMap,
      isMember,
      memberSavingsPct: teaserSavingsPct,
      accountPricing: !isMember && memberCtx.accountId != null,
      membershipTeaser,
      brandName: brandRow?.name ?? null,
      reviewSummary,
      // Grouped / bundle contents (Zoey product types, authored in the portal — they ride
      // products.metafields, which is portal-owned). Null for every other product.
      kit: productKit,
      kitPrices,
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
  // Precedence: nodes → v2 blocks → v1 → legacy. The body of this branch used
  // to live here, and only here, which is why Industry Kitchens could not have
  // one; it is now engine (src/builder/product-node-branch.tsx) shared by both
  // sites. The route stays SEO/JSON-LD and tracking owner.
  {
    const nodeRendered = await renderProductNodeBranch({
      slug,
      member: {
        customerGroupId: memberCtx.customerGroupId,
        isMember,
        loggedIn: memberCtx.loggedIn,
        planPrice: memberCtx.planPrice ? parseFloat(memberCtx.planPrice).toFixed(2) : null,
        teaserCustomerGroupId: memberCtx.teaserCustomerGroupId,
        accountId: memberCtx.accountId,
        ladderShare: memberCtx.ladderShare,
      },
      jsonLd,
      viewedProduct: {
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
      },
      draft,
      // Grouped / bundle contents, for the sealed `product-kit` leaf.
      nativeData: { kit: productKit, kitPrices },
    });
    if (nodeRendered) return nodeRendered;
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
            videos,
            relatedProducts,
            relatedPricing: relatedPricing as unknown as Record<string, unknown>,
            brandRow,
            breadcrumbs,
            memberPrice,
            memberPriceMap,
            isMember,
            memberSavingsPct: teaserSavingsPct,
            accountPricing: !isMember && memberCtx.accountId != null,
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
          {/* Carton tiers this product is in (card p6YVxc4P). Rendered on the
              CMS-template path as well as the fallback below and the node-tree
              branch above: 149 of the CAP-/SC- products sit on THIS storefront,
              so an insert on only one branch leaves the table on a page nobody
              sees the day `cms_product_template_enabled` is switched on. */}
          <ProductOfferTiers sku={product.sku} productId={product.id} unitPrice={memberPrice} />
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

      {/* Carton tiers this product is in (card p6YVxc4P). Draws nothing when it is
          in no banded offer, and reads the same live promotions the cart applies. */}
      <ProductOfferTiers sku={product.sku} productId={product.id} unitPrice={memberPrice} />
    </div>
  );
}

/** A review row as the SHOPPER may see it — the six fields this page renders. */
function publicReviews(rows: unknown): {
  id: number;
  rating: number;
  title: string | null;
  text: string | null;
  author_name: string | null;
  created_at: string | Date | null;
}[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as number,
      rating: r.rating as number,
      title: (r.title ?? null) as string | null,
      text: (r.text ?? null) as string | null,
      author_name: (r.author_name ?? null) as string | null,
      created_at: (r.created_at ?? null) as string | Date | null,
    };
  });
}
