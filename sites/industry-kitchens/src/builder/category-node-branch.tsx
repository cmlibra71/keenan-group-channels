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
import {
  composeCategoryPagePayload,
  loadJsSandbox,
  computeCallResults,
  type NodeTree,
} from "@keenan/services/builder";
import { cmsFunctionService } from "@keenan/services/services";
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
  selections: { sub: string[]; brand: string[]; price: string[]; stock: string[] };
  memberPricingEnabled: boolean;
  categorySlugFallback: string;
  /** draftMode() OR the `x-kg-json` parity header. */
  draft: boolean;
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
  const nodeTree = (catTemplate?.node_tree as NodeTree | null) ?? null;
  if (!nodeTree) return null;
  if (!draft && !(await getFeatureFlag("node_category_template_enabled"))) return null;

  const scoped = (await applyAccountPrices(
    await applyCatalogScope(products as { id: number }[])
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
  const components = (await (draft ? getDraftComponents() : getComponents()).catch(
    () => ({})
  )) as Record<string, NodeTree>;
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
        tree={nodeTree}
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
