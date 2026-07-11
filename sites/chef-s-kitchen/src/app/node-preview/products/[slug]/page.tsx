import { notFound } from "next/navigation";
import { draftMode } from "next/headers";
import { CHANNEL_ID,
  getProductBySlug,
  getProductPageData,
  getNamedStyles,
  getComponents,
  getCmsTemplate,
} from "@/lib/store";
import { getMemberContext } from "@/lib/member";
import { BuilderProductPage } from "@/builder/BuilderProductPage";
import { cmsFunctionService } from "@keenan/services/services";
import { loadJsSandbox, computeCallResults } from "@keenan/services/builder";
import { SEED_PRODUCT_TREE } from "@/builder/seeds/product";

// ============================================================================
// NODE-RENDER PREVIEW ROUTE  —  /node-preview/products/[slug]
//
// A parallel, DEV-ONLY route that renders the product page from the node tree
// (BuilderProductPage), for side-by-side pixel comparison against the live
// /products/[slug] page. It NEVER affects the live route: this file 404s in
// production and the real product route is untouched. Chrome (header/footer)
// comes from the shared root layout, so only the product body differs.
// ============================================================================

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: "Node preview", robots: { index: false, follow: false } };
}

export default async function NodePreviewProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const { isEnabled: draft } = await draftMode();

  const memberCtx = await getMemberContext();
  const membershipTeaser = {
    fromPrice: memberCtx.planPrice ? parseFloat(memberCtx.planPrice).toFixed(2) : null,
  };

  const payload = await getProductPageData(slug, {
    memberContext: {
      customerGroupId: memberCtx.customerGroupId,
      isMember: memberCtx.isMember,
      planPrice: membershipTeaser.fromPrice,
    },
    draft,
  }).catch(() => null);
  if (!payload) notFound();

  // Authored tree wins; seed is the fallback (same precedence as the live route).
  const nodesDoc = (await getCmsTemplate("product", draft).catch(() => null)) as {
    builder_kind?: string;
    node_tree?: unknown;
  } | null;
  const storedTree =
    nodesDoc?.builder_kind === "nodes" && nodesDoc.node_tree
      ? (nodesDoc.node_tree as typeof SEED_PRODUCT_TREE)
      : null;
  const namedStyles = await getNamedStyles().catch(() => ({}));
  const components = (await getComponents().catch(() => ({}))) as Record<
    string,
    typeof SEED_PRODUCT_TREE
  >;

  const nodeTree = storedTree ?? SEED_PRODUCT_TREE;
  const jsFunctions = await cmsFunctionService.enabledMapForChannel(CHANNEL_ID).catch(() => ({}) as Record<string, string>);
  let callResults: Record<string, unknown> = {};
  if (Object.keys(jsFunctions).length > 0) {
    await loadJsSandbox(jsFunctions).catch(() => null);
    callResults = await computeCallResults(nodeTree.root, jsFunctions, payload as object).catch(() => ({}));
  }
  return (
    <BuilderProductPage
      tree={nodeTree}
      payload={payload}
      namedStyles={namedStyles}
      components={components}
      jsFunctions={jsFunctions}
      callResults={callResults}
    />
  );
}
