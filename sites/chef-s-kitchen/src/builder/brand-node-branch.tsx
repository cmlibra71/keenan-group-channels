import { cookies } from "next/headers";
import { GST_COOKIE, parseGstInclusive } from "@/lib/gst-cookie";
import {
  getFeatureFlag,
  getNamedStyles,
  getComponents,
  getDraftComponents,
  getChannelSetting,
} from "@/lib/store";
import { CHANNEL_ID } from "@/lib/channel";
import { getMemberContext, applyAccountPrices } from "@/lib/member";
import { applyCatalogScope } from "@/lib/catalog-scope";
import {
  composeBrandPagePayload,
  loadJsSandbox,
  computeCallResults,
  type NodeTree,
} from "@keenan/services/builder";
import { cmsFunctionService } from "@keenan/services/services";
import { BuilderBrandPage, type BrandGridProduct } from "@/builder/BuilderBrandPage";

// ============================================================================
// The brand template's Site Builder branch — ENGINE.
//
// This file is identical on every site. It was extracted from Chefs Depot's
// brand route, which was the only place it existed; Industry Kitchens' route
// could not grow a node path without re-deriving all of it, and a re-derivation
// is how the two sites drift (see docs/architecture/seam-audit.md §2b).
//
// The one genuinely per-site input is `pricing`: Chefs Depot computes it with
// getListingPricing (member price map + savings teaser), Industry Kitchens with
// getListingMemberPrices (map only). So the caller computes it and passes it
// in — everything else here reads the same modules on both sites.
//
// The route stays the data owner. This function only decides whether the node
// path applies, scopes/prices the rows, and renders. It returns null when the
// route should fall through to its existing block rendering, which keeps the
// branch strictly additive on a site that has no tree authored yet.
// ============================================================================

export interface BrandListingPricing {
  memberPriceMap?: Record<number, number>;
  isMember?: boolean;
  planPrice?: string | null;
}

export interface BrandNodeBranchArgs {
  /** The `__brand__` CMS page as loaded by the route (draft-aware). */
  brandCms: unknown;
  brand: Record<string, unknown>;
  products: { id: number }[];
  total: number;
  pricing: BrandListingPricing;
  memberPricingEnabled: boolean;
  /** draftMode() OR the `x-kg-json` parity header. */
  draft: boolean;
}

/**
 * Renders the brand template's node tree, or returns null if the node path
 * does not apply (no tree authored, or the flag is off outside draft).
 */
export async function renderBrandNodeBranch({
  brandCms,
  brand,
  products,
  total,
  pricing,
  memberPricingEnabled,
  draft,
}: BrandNodeBranchArgs): Promise<React.ReactElement | null> {
  const nodeTree =
    ((brandCms as { node_tree?: unknown } | null)?.node_tree as NodeTree | null) ?? null;
  if (!nodeTree) return null;
  if (!draft && !(await getFeatureFlag("node_brand_template_enabled"))) return null;

  const scoped = (await applyAccountPrices(
    await applyCatalogScope(products as { id: number }[])
  )) as unknown as BrandGridProduct[];

  const memberCtx = await getMemberContext().catch(() => null);
  const [pricesIncludeTax, cookieStore] = await Promise.all([
    getFeatureFlag("prices_include_tax"),
    cookies(),
  ]);
  const gstInclusive = parseGstInclusive(cookieStore.get(GST_COOKIE)?.value);

  const payload = composeBrandPagePayload({
    channelId: CHANNEL_ID,
    brand,
    products: scoped as unknown as Record<string, unknown>[],
    total,
    pricing,
    customer: {
      isMember: memberCtx?.isMember ?? false,
      loggedIn: memberCtx?.loggedIn ?? false,
    },
    gst: { inclusive: gstInclusive, pricesIncludeTax },
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
      <BuilderBrandPage
        tree={nodeTree}
        payload={payload}
        products={scoped}
        pricing={pricing}
        memberPricingAvailable={memberPricingEnabled}
        namedStyles={namedStyles}
        components={components}
        jsFunctions={jsFunctions}
        callResults={callResults}
        draft={draft}
      />
    </>
  );
}
