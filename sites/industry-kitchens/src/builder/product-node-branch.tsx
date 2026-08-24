import {
  getFeatureFlag,
  getCmsTemplate,
  getProductPageData,
  getNamedStyles,
  getComponents,
  getDraftComponents,
  getChannelSetting,
} from "@/lib/store";
import { CHANNEL_ID } from "@/lib/channel";
import { loadJsSandbox, computeCallResults, guardBuyControls, guardBuyControlsInComponents } from "@keenan/services/builder";
import { cmsFunctionService } from "@keenan/services/services";
import { BuilderProductPage } from "@/builder/BuilderProductPage";
import { SEED_PRODUCT_TREE } from "@/builder/seeds/product";
import { withSilverChefNode } from "@/builder/silverchef-node";
import { withImageNoticeNode } from "@/builder/product-image-notice";
import { withUpsellBlock } from "@/builder/upsell-node";
import { ViewedProductTracker } from "@/components/analytics/ViewedProductTracker";

// ============================================================================
// The product template's Site Builder branch — ENGINE.
//
// Extracted from Chefs Depot's product route, where it was the only copy. Same
// seam as brand and category: identical on every site, the route stays owner of
// SEO and tracking (it passes the JSON-LD and the tracker's product in), and
// this returns null when the node path does not apply.
//
// Precedence is unchanged: an AUTHORED template doc wins, the seed tree is the
// fallback, and a null payload falls through to the route's block/legacy paths.
// ============================================================================

export interface ViewedProduct {
  id: number;
  sku: string | null;
  name: string;
  price: number | null;
  imageUrl: string | null;
  categories: string[];
  brand: string | null;
}

export interface ProductMemberContext {
  customerGroupId: number | null;
  isMember: boolean;
  loggedIn: boolean;
  planPrice: string | null;
  /** Non-members get a savings PERCENTAGE for the join teaser — never a price. */
  teaserCustomerGroupId: number | null;
  accountId: number | null;
}

export interface ProductNodeBranchArgs {
  slug: string;
  member: ProductMemberContext;
  /** The route owns SEO and hands the assembled JSON-LD in. Optional: a site
   *  whose product route emits no JSON-LD gets none here either — this branch
   *  must never invent structured data the native page does not claim. */
  jsonLd?: unknown;
  viewedProduct: ViewedProduct;
  /** draftMode() OR the `x-kg-json` parity header. */
  draft: boolean;
  /** Route-owned data this site's sealed product natives need. Opaque here. */
  nativeData?: Record<string, unknown>;
}

/**
 * Renders the product template's node tree, or returns null if the node path
 * does not apply (flag off, or no payload for this product).
 */
export async function renderProductNodeBranch({
  slug,
  member,
  jsonLd,
  viewedProduct,
  draft,
  nativeData,
}: ProductNodeBranchArgs): Promise<React.ReactElement | null> {
  // CMS_NODES_FORCE=1 is for local testing only — never set in production.
  const forceNodes = process.env.CMS_NODES_FORCE === "1";
  // `draft` counts as an opt-in, exactly like the brand and category branches.
  // Without it /json/products/<slug> renders the BLOCK template no matter what
  // is authored, so a product conversion could not be previewed or parity-
  // checked at all until its flag was already on — which is backwards, since
  // the flag is what the parity run is meant to justify. Chefs Depot never hit
  // this because its flag has been on since the template shipped.
  if (!forceNodes && !draft && !(await getFeatureFlag("node_product_template_enabled"))) return null;

  const payload = await getProductPageData(slug, {
    memberContext: {
      customerGroupId: member.customerGroupId,
      isMember: member.isMember,
      loggedIn: member.loggedIn,
      planPrice: member.planPrice,
      teaserCustomerGroupId: member.teaserCustomerGroupId,
    },
    // Per-account contract prices override every layer; the payload's product +
    // related cards and its variant pricing are all resolved with the account
    // in scope.
    accountId: member.accountId,
    draft,
  }).catch(() => null);
  if (!payload) return null;

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
  // The SilverChef / Skope Funding weekly panel (card 6f47rFeT) is PLACED here
  // rather than authored, for the same reason the kit block is: this page
  // renders from a stored tree, so a panel that must appear on every product on
  // both sites cannot wait for two templates to be hand-edited. Idempotent by
  // node id, and nothing is written back to the stored tree.
  // The "images are illustrative" banner (card 82HgV23q) is PLACED here for the same
  // reason: it has to be able to appear on any product on either site, and both sites
  // render this page from a stored tree. Idempotent by node id; renders nothing unless
  // the product carries the tick, so every other product page is unchanged.
  //
  // The buy row's per-product refusals are applied to the TREE, not just to the payload flags the
  // tree binds to. Card 7vu2iEEZ: the three live buy rows express "no Add to Cart" three different
  // ways (Chefs Depot desktop hides a live/greyed pair, its phone bar greys the twin, Industry
  // Kitchens greys one always-rendered button), so a flag alone left a dead grey button with no
  // wording beside it on two of the three — which `docs/behaviour/catalogue.md` > sf-product-page
  // forbids outright, because CXnP1lrL removed every string that could have explained one. The
  // pass is pure and never touches a tile (a tile names the product it buys); it runs here rather
  // than being written into the stored trees so there is nothing to undo on a rollback and a site
  // that re-authors its buy row keeps the behaviour. It wraps the PLACED nodes as well as the
  // stored ones, so a buy control introduced by a future placed node is guarded too.
  // The upsell rail (card fYqTM5Ot) is PLACED here for the third time on this page and for
  // the same reason: Zoey shows upsells as their own block, the data has been sitting in
  // `product_upsells` since the import, and nothing on either stored tree reads it. The pass
  // clones the tree's OWN related block so the rail keeps that site's tile component — which
  // is what keeps the listing-tile rules (no stock wording, Add to Cart intact) true of it —
  // and renders nothing at all for a product with no upsells. It runs BEFORE guardBuyControls
  // so the cloned tiles are guarded exactly like the ones they were cloned from.
  const nodeTree = guardBuyControls(
    withUpsellBlock(withImageNoticeNode(withSilverChefNode(storedTree ?? SEED_PRODUCT_TREE)))
  );

  const namedStyles = await getNamedStyles().catch(() => ({}));
  const components = guardBuyControlsInComponents(
    (await (draft ? getDraftComponents() : getComponents()).catch(() => ({}))) as Record<
      string,
      typeof SEED_PRODUCT_TREE
    >
  );
  // CSS for AUTHORED classes: the static Tailwind sheet only covers classes in
  // this repo's source, so the portal compiles the channel's designer
  // vocabulary (arbitrary values, lg:/hover: variants, palette colours…) on
  // publish/save and stores it in channel_settings. Injected server-side so the
  // first paint matches the editor canvas exactly.
  const builderCss =
    ((await getChannelSetting("builder_published_css").catch(() => null)) as {
      css?: string;
    } | null)?.css ?? "";

  // JavaScript function library: SSR evaluates call-conditions live (the
  // sandbox is awaited here), and callResults keeps the client's first paint
  // identical until its wasm loads.
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
    <div>
      {jsonLd !== undefined && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
        />
      )}
      {builderCss && <style id="kg-builder-css" dangerouslySetInnerHTML={{ __html: builderCss }} />}
      <ViewedProductTracker product={viewedProduct} />
      <BuilderProductPage
        tree={nodeTree}
        payload={payload}
        namedStyles={namedStyles}
        components={components}
        jsFunctions={jsFunctions}
        callResults={callResults}
        nativeData={nativeData}
      />
    </div>
  );
}
