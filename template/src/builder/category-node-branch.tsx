import { cookies } from "next/headers";
import { GST_COOKIE, parseGstInclusive } from "@/lib/gst-cookie";
import {
  getFeatureFlag,
  getCmsTemplate,
  getNamedStyles,
  getComponents,
  getDraftComponents,
  getChannelSetting,
} from "@/lib/store";
import { CHANNEL_ID } from "@/lib/channel";
import { getMemberContext, applyAccountPrices } from "@/lib/member";
import { applyCatalogScope } from "@/lib/catalog-scope";
import { attachBrandLogos } from "@/lib/brand-logo-fallback";
import type { AttributeSelections } from "@keenan/services/services";
import {
  composeCategoryPagePayload,
  loadJsSandbox,
  computeCallResults,
  type NodeTree,
} from "@keenan/services/builder";
import { cmsFunctionService } from "@keenan/services/services";
import { treePlacesSeoCopy } from "@/builder/seo-copy-placement";
import {
  withCategoryFacetComponents,
  withCategoryFacetNodes,
} from "@/builder/category-facet-injection";
import {
  stripCategoryBannerBackdrop,
  findBannerBackdropNodes,
} from "@/builder/category-banner-backdrop";
import {
  BuilderCategoryPage,
  type CategoryGridProduct,
} from "@/builder/BuilderCategoryPage";

// ============================================================================
// The category template's Site Builder branch — ENGINE.
//
// Extracted from Chefs Depot's category route, where it was the only copy.
// Same seam as brand-node-branch: identical on every site, the route stays data
// owner and passes its own listing + pricing in, and this returns null when no
// tree is authored so the branch is strictly additive.
// ============================================================================

export interface CategoryListingPricing {
  memberPriceMap?: Record<number, number>;
  isMember?: boolean;
  planPrice?: string | null;
}

export interface CategoryNodeBranchArgs {
  category: Record<string, unknown> & { id: number; name: string; slug?: string | null };
  products: { id: number }[];
  total: number;
  shown: number;
  facets: unknown;
  page: number;
  hasMore: boolean;
  nextPageHref: string;
  sort: string | undefined;
  pricing: CategoryListingPricing;
  breadcrumbs: { id: number; name: string; slug: string }[];
  /** Child categories for the tile strip; [] when the route has none. */
  subcategories?: Record<string, unknown>[];
  /** Current URL facet selections, comma-split, per param. */
  selections: {
    sub: string[];
    brand: string[];
    price: string[];
    stock: string[];
    /** Per-category attribute windows / ticked values (C8G4f4U8). */
    attributes?: AttributeSelections;
  };
  memberPricingEnabled: boolean;
  categorySlugFallback: string;
  /** draftMode() OR the `x-kg-json` parity header. */
  draft: boolean;
}

/**
 * Does the authored Category Page Template PLACE this storefront's own approved
 * page copy?
 *
 * The wording written and approved on Products → Category page SEO used to have
 * exactly one home: the block at the foot of the page, hard-coded in the route.
 * Since card nYxPgpvK the payload also carries it as `category.seo_intro_html`,
 * so a template can put it in the header, above the grid, anywhere — which is
 * the whole ask ("no way to manipulate the positioning or formatting of that
 * text inside the CMS", Steve 2026-08-24).
 *
 * The route has to know, because a page that prints the same paragraphs twice is
 * worse than one that cannot move them: duplicated body copy on 4,231 category
 * pages is the cannibalisation this content exists to avoid. So the foot block
 * withholds its intro — and only its intro, the questions stay — when the tree
 * binds that path. A site with no tree, or with the node not placed, behaves
 * exactly as it did before.
 *
 * Component MASTERS are searched too: a node placed inside a shared component is
 * still on the page, and the instance only carries the component's key.
 *
 * Every read here is the same `cache()`d load the branch itself does, so calling
 * both on one request costs one fetch.
 */
export async function categoryTreePlacesSeoCopy(draft: boolean): Promise<boolean> {
  const catTemplate = (await getCmsTemplate("category_layout", draft).catch(() => null)) as {
    node_tree?: unknown;
  } | null;
  const nodeTree = (catTemplate?.node_tree as NodeTree | null) ?? null;
  if (!nodeTree?.root) return false;
  if (!draft && !(await getFeatureFlag("node_category_template_enabled"))) return false;
  const components = (await (draft ? getDraftComponents() : getComponents()).catch(
    () => ({})
  )) as Record<string, NodeTree>;
  return treePlacesSeoCopy(nodeTree, components);
}

/**
 * Renders the category template's node tree, or returns null if the node path
 * does not apply (no tree authored, or the flag is off outside draft).
 */
export async function renderCategoryNodeBranch({
  category,
  products,
  total,
  shown,
  facets,
  page,
  hasMore,
  nextPageHref,
  sort,
  pricing,
  breadcrumbs,
  subcategories,
  selections,
  memberPricingEnabled,
  categorySlugFallback,
  draft,
}: CategoryNodeBranchArgs): Promise<React.ReactElement | null> {
  const catTemplate = (await getCmsTemplate("category_layout", draft).catch(() => null)) as {
    node_tree?: unknown;
  } | null;
  const storedTree = (catTemplate?.node_tree as NodeTree | null) ?? null;
  if (!storedTree) return null;
  if (!draft && !(await getFeatureFlag("node_category_template_enabled"))) return null;

  // Card TnQJpunl (Steve, 2026-08-26): the category feature image is not also
  // the stretched backdrop behind the header — "just the main green site colour,
  // no image". Applied to the tree on the way to the renderer rather than
  // written back to the stored tree, so there is nothing to undo on a rollback
  // and a republish from the designer cannot quietly reinstate it. A no-op on a
  // tree that never had one — Industry Kitchens' is authored clean — so this
  // shared module changes exactly one storefront. See
  // `builder/category-banner-backdrop.ts`.
  const stripped = stripCategoryBannerBackdrop(storedTree);
  const nodeTree = stripped.tree;

  // The post-condition, and it is not belt-and-braces. The strip matches on node
  // id and on label; an author who rebuilds the backdrop under a fresh name
  // defeats both, and Steve's screenshot comes straight back with nothing
  // anywhere saying the fix stopped working. `findBannerBackdropNodes` asks the
  // acceptance question structurally instead — is anything still stretching
  // `category.image_url` across the banner (`absolute` + `inset-0`) — so a
  // silent regression announces itself in the logs of the site it happened on.
  // It cannot fire on a subcategory tile or the `/categories` index: those bind
  // the same field in flow, without the full-bleed positioning.
  const survivingBackdrop = findBannerBackdropNodes(nodeTree);
  if (survivingBackdrop.length > 0) {
    console.warn(
      `[TnQJpunl] category banner backdrop survived the strip: ${survivingBackdrop.join(", ")}` +
        ` (removed by id/label: ${stripped.removed.join(", ") || "none"}).` +
        " Add its label to BANNER_BACKDROP_LABELS in builder/category-banner-backdrop.ts."
    );
  }

  // Card tSrCcnvx (Tim, 2026-08-19): the brand logo an authored tile falls back
  // to when a product has no photo. Additive — every other field on the row is
  // copied through — and the `product-card` master reads it as
  // `props.card.brand_logo_url` (see `product-card-brand-logo.ts`).
  const scoped = (await attachBrandLogos(
    await applyAccountPrices(await applyCatalogScope(products as { id: number }[]))
  )) as unknown as CategoryGridProduct[];
  const memberCtx = await getMemberContext().catch(() => null);
  // GST facts for the price-block masters: the composer emits both ex/inc
  // labels; the SSR cookie sets the first-paint choice (the wrapper overlays
  // the live toggle thereafter).
  const [pricesIncludeTax, cookieStore] = await Promise.all([
    getFeatureFlag("prices_include_tax"),
    cookies(),
  ]);
  const gstInclusive = parseGstInclusive(cookieStore.get(GST_COOKIE)?.value);

  const payload = composeCategoryPagePayload({
    channelId: CHANNEL_ID,
    category: category as unknown as Record<string, unknown>,
    listing: {
      products: scoped as unknown as Record<string, unknown>[],
      total,
      facets,
    },
    page,
    hasMore,
    nextPageHref,
    sort,
    pricing,
    breadcrumbs,
    subcategories,
    selections,
    customer: {
      isMember: memberCtx?.isMember ?? false,
      loggedIn: memberCtx?.loggedIn ?? false,
    },
    gst: { inclusive: gstInclusive, pricesIncludeTax },
    memberPricingAvailable: memberPricingEnabled,
    draft,
  });

  const namedStyles = await getNamedStyles().catch(() => ({}));
  // The per-category attribute sections and the price slider, placed into the
  // AUTHORED rail at render time (card C8G4f4U8). Which attributes a category
  // offers is decided from that category's own data, so no designed page can
  // carry a section for them; this is the same pure, idempotent, nothing-stored
  // pass the illustrative-image banner uses on the product tree (82HgV23q). A
  // component that does not repeat over the listing's facets is untouched.
  const components = withCategoryFacetComponents(
    (await (draft ? getDraftComponents() : getComponents()).catch(() => ({}))) as Record<
      string,
      NodeTree
    >
  );
  const builderCss =
    ((await getChannelSetting("builder_published_css").catch(() => null)) as {
      css?: string;
    } | null)?.css ?? "";

  const jsFunctions = await cmsFunctionService
    .enabledMapForChannel(CHANNEL_ID)
    .catch(() => ({}) as Record<string, string>);
  let callResults: Record<string, unknown> = {};
  if (Object.keys(jsFunctions).length > 0) {
    await loadJsSandbox(jsFunctions).catch(() => null);
    callResults = await computeCallResults(nodeTree.root, jsFunctions, payload as object).catch(
      () => ({})
    );
  }

  return (
    <>
      {builderCss && <style id="kg-builder-css" dangerouslySetInnerHTML={{ __html: builderCss }} />}
      <BuilderCategoryPage
        tree={withCategoryFacetNodes(nodeTree)}
        payload={payload}
        listing={{
          products: scoped,
          total,
          shown,
          facets,
          hasMore,
          nextPageHref,
          memberPricingAvailable: memberPricingEnabled,
          pricing,
          categoryName: category.name,
          categorySlug: category.slug ?? categorySlugFallback,
        }}
        namedStyles={namedStyles}
        components={components}
        jsFunctions={jsFunctions}
        callResults={callResults}
        draft={draft}
      />
    </>
  );
}
