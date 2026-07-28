import { draftMode, cookies, headers } from "next/headers";
import { GST_COOKIE, parseGstInclusive } from "@/lib/gst-cookie";
import { getCmsPage, getFeatureFlag, getNamedStyles, getComponents, getDraftComponents, getChannelSetting, CHANNEL_ID } from "@/lib/store";
import { getMemberContext } from "@/lib/member";
import { BlockRenderer, type RenderedBlock } from "@/blocks/BlockRenderer";
import { DEFAULT_HOME_BLOCKS } from "@/blocks/home-blocks";
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

// The homepage is composed of CMS section blocks. Content/order is editable via
// the `home` CMS page; with none set it falls back to DEFAULT_HOME_BLOCKS — the
// current section order — so the page renders exactly as before.
export default async function HomePage() {
  const { isEnabled } = await draftMode();
  const draft = isEnabled || (await headers()).get("x-kg-json") === "1";
  const home = await getCmsPage("home", draft);

  // ═══ Site Builder node path — the home doc authored in the node designer,
  // gated by node_home_enabled (or draft mode with an authored draft). The
  // nine legacy sections are sealed natives; the route prefetches ONLY the
  // data the authored tree uses (walkTree over componentKeys). ═══
  const nodeTree = ((home as { node_tree?: unknown } | null)?.node_tree as NodeTree | null) ?? null;
  if (nodeTree && ((await getFeatureFlag("node_home_enabled")) || draft)) {
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
      }),
      getMemberContext().catch(() => null),
    ]);
    const [pricesIncludeTax, cookieStore] = await Promise.all([
      getFeatureFlag("prices_include_tax"),
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
      draft,
    });
    const namedStyles = await getNamedStyles().catch(() => ({}));
    const components = (await (draft ? getDraftComponents() : getComponents()).catch(() => ({}))) as Record<string, NodeTree>;
    const builderCss =
      ((await getChannelSetting("builder_published_css").catch(() => null)) as { css?: string } | null)?.css ?? "";
    const jsFunctions = await cmsFunctionService.enabledMapForChannel(CHANNEL_ID).catch(() => ({}) as Record<string, string>);
    let callResults: Record<string, unknown> = {};
    if (Object.keys(jsFunctions).length > 0) {
      await loadJsSandbox(jsFunctions).catch(() => null);
      callResults = await computeCallResults(nodeTree.root, jsFunctions, payload as object).catch(() => ({}));
    }
    return (
      <>
        {builderCss && <style id="kg-builder-css" dangerouslySetInnerHTML={{ __html: builderCss }} />}
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
    );
  }

  const blocks: RenderedBlock[] =
    home && Array.isArray(home.blocks) && home.blocks.length > 0
      ? (home.blocks as unknown as RenderedBlock[])
      : DEFAULT_HOME_BLOCKS.map((t) => ({ block_type: t, region: "main", props: {} }));
  return (
    <div>
      <BlockRenderer blocks={blocks} draft={draft} />
    </div>
  );
}
