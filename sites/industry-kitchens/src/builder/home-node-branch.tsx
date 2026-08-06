import { cookies, headers } from "next/headers";
import { draftMode } from "next/headers";
import { GST_COOKIE, parseGstInclusive } from "@/lib/gst-cookie";
import {
  getCmsPage,
  getFeatureFlag,
  getNamedStyles,
  getComponents,
  getDraftComponents,
  getChannelSetting,
} from "@/lib/store";
import { CHANNEL_ID } from "@/lib/channel";
import { getMemberContext } from "@/lib/member";
import {
  composeHomePagePayload,
  walkTree,
  collectBindingPaths,
  loadJsSandbox,
  computeCallResults,
  type NodeTree,
} from "@keenan/services/builder";
import { cmsFunctionService } from "@keenan/services/services";
import { BuilderHomePage } from "@/builder/BuilderHomePage";
import { loadHomeNativeData } from "@/builder/home-data";

// ============================================================================
// The homepage's Site Builder branch — ENGINE.
//
// Extracted from Chefs Depot's app/page.tsx, where it was the only copy, which
// is why Industry Kitchens' homepage could not render a node tree at all. Same
// seam as the brand/category/product branches: identical on every site, and it
// returns null when the node path does not apply so the route falls through to
// whatever it renders today.
//
// The route prefetches ONLY the data the authored tree actually uses. Two
// signals feed that: the componentKeys in the tree (a section placed as a
// sealed native), and the tree's binding paths (an authored section binding
// home.featured directly, which the key scan cannot see). Both are unioned, so
// exploding a native into real nodes never silently drops its data.
//
// What differs per site is `loadHomeNativeData` — each site's own sections and
// its own queries.
// ============================================================================

export interface HomeNodeBranchArgs {
  /** draftMode() OR the `x-kg-json` parity header. Pass through from the route. */
  draft?: boolean;
}

/**
 * Renders the homepage's node tree, or returns null when the node path does not
 * apply (no tree authored, or the flag is off outside draft).
 */
export async function renderHomeNodeBranch(
  args: HomeNodeBranchArgs = {}
): Promise<{ element: React.ReactElement; draft: boolean } | null> {
  const { isEnabled } = await draftMode();
  const draft = args.draft ?? (isEnabled || (await headers()).get("x-kg-json") === "1");

  const home = await getCmsPage("home", draft).catch(() => null);
  const nodeTree = ((home as { node_tree?: unknown } | null)?.node_tree as NodeTree | null) ?? null;
  if (!nodeTree) return null;
  if (!draft && !(await getFeatureFlag("node_home_enabled"))) return null;

  const keys = new Set<string>();
  walkTree(nodeTree.root, (n) => {
    if (n.kind === "component") keys.add(n.componentKey);
  });
  // Authored sections reference data by BINDING (repeat over home.featured,
  // hero copy bound to home.hero.*) — those needs are invisible to the
  // componentKey scan, so union in the tree's binding paths.
  const paths = collectBindingPaths(nodeTree.root);
  const uses = (prefix: string) =>
    [...paths].some((x) => x === prefix || x.startsWith(`${prefix}.`) || x.startsWith(`${prefix}[`));

  const [{ home: homeData, sections }, memberCtx] = await Promise.all([
    loadHomeNativeData(keys, {
      hero: uses("home.hero"),
      cats: uses("home.topCategories"),
      brands: uses("home.brands"),
      featured: uses("home.featured"),
      clearance: uses("home.clearance"),
      faq: uses("home.faq"),
      membership: uses("home.membership"),
      prize: uses("home.prize"),
      stats: uses("home.stats"),
      plan: uses("home.plan"),
      sectionList: uses("home.sectionList"),
    }),
    getMemberContext().catch(() => null),
  ]);

  const [pricesIncludeTax, memberPricingEnabled, cookieStore] = await Promise.all([
    getFeatureFlag("prices_include_tax"),
    // A home rail that places the shared product-card needs the same fact the
    // category and brand grids pass it, or every card on the homepage decides
    // member pricing is off.
    getFeatureFlag("member_pricing_enabled"),
    cookies(),
  ]);
  const gstInclusive = parseGstInclusive(cookieStore.get(GST_COOKIE)?.value);

  const payload = composeHomePagePayload({
    channelId: CHANNEL_ID,
    sections,
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

  return {
    draft,
    element: (
      <>
        {builderCss && (
          <style id="kg-builder-css" dangerouslySetInnerHTML={{ __html: builderCss }} />
        )}
        <BuilderHomePage
          tree={nodeTree}
          payload={payload}
          home={homeData}
          namedStyles={namedStyles}
          components={components}
          jsFunctions={jsFunctions}
          callResults={callResults}
          draft={draft}
        />
      </>
    ),
  };
}
