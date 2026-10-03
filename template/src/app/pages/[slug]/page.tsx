import { notFound } from "next/navigation";
import { redirectIfMapped } from "@/lib/redirect-seam";
import { draftMode, headers, cookies } from "next/headers";
import type { Metadata } from "next";
import { getContentPage, getCmsPage, getCmsTemplate, getFeatureFlag, getNamedStyles, getComponents, getDraftComponents, getChannelSetting, CHANNEL_ID, getEnabledCmsFunctions, getSiteConfig, getAssetDims } from "@/lib/store";
import { getMemberContext } from "@/lib/member";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { composeContentPagePayload, calendarNow, pageJsonLdBlocks, jsonLdScriptText, resolvePageCanonical, collectPageLists, bindPageLists, listingForPageLists, collectStaticImageUrls, applyRegisteredImageDims, type PageSeo } from "@keenan/services/builder";
import { loadPageLists } from "@/builder/page-lists-data";
import { GST_COOKIE, parseGstInclusive } from "@/lib/gst-cookie";
import { siteBaseUrl } from "@/lib/seo";
import { RichContent } from "@/components/content/RichContent";
import { chooseContentPageTree } from "@/lib/content-page-tree";
import { financeApplyFunderForSlug, withFinanceApplyLogo } from "@/lib/finance/finance-apply-logo";
import { BlockRenderer, type RenderedBlock } from "@/blocks/BlockRenderer";
import { BuilderContentPage } from "@/builder/BuilderContentPage";
import { BuilderCssLink } from "@/builder/builder-css-link";
import { draftBuilderCss, draftCssId } from "@/builder/draft-builder-css";
import { usedComponents } from "@/builder/used-components";
import { siteRenderPolicy } from "@/builder/site-render-policy";
import {
  loadJsSandbox,
  computeCallResults,
  usedCmsFunctions,
  BUILDER_CSS_INPUTS_SETTING_KEY,
  type BuilderCssInputs,
  type NodeTree,
} from "@keenan/services/builder";

/** The page's SEO settings (cms_pages.seo, published = the served version's). */
function pageSeoOf(cms: unknown): PageSeo | null {
  return ((cms as { seo?: PageSeo | null }).seo ?? null) as PageSeo | null;
}

/** The page's JSON-LD (its own blocks + the FAQPage built from its accordions), site policy. */
function PageJsonLd({ blocks }: { blocks: Record<string, unknown>[] }) {
  return (
    <>
      {blocks.map((b, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScriptText(b) }} />
      ))}
    </>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { isEnabled } = await draftMode();
  const draft = isEnabled || (await headers()).get("x-kg-json") === "1";

  const cms = await getCmsPage(slug, draft);
  if (cms) {
    const meta = cms.page_meta as { meta_title?: string; meta_description?: string; og_image_url?: string | null };
    const title = meta.meta_title || cms.meta_title || cms.title;
    const description = meta.meta_description || cms.meta_description || undefined;
    if (!siteRenderPolicy.pageSeo) return { title, description };
    // Page SEO (site policy): canonical + Open Graph, as the old Zoey info pages
    // carried. `robots` is deliberately not named — that would replace the
    // layout's site-wide siteRobots() (lib/seo.ts).
    const { site, channel } = await getSiteConfig();
    const base = siteBaseUrl(site?.url);
    const url = resolvePageCanonical(pageSeoOf(cms), base, `/pages/${slug}`);
    // The share image is versioned like the rest (page_meta of the served version).
    const rawImage = meta.og_image_url || null;
    const image = rawImage
      ? rawImage.startsWith("//")
        ? `https:${rawImage}`
        : rawImage.startsWith("/")
          ? base + rawImage
          : rawImage
      : null;
    return {
      title,
      description,
      alternates: { canonical: url },
      openGraph: {
        title,
        description,
        url,
        siteName: site?.siteName || channel?.name || undefined,
        locale: "en_AU",
        type: "article",
        images: image ? [{ url: image }] : undefined,
      },
    };
  }

  const page = await getContentPage(slug);
  if (!page) return {};
  return {
    title: page.meta_title || page.heading || page.title,
    description: page.meta_description || undefined,
  };
}

export default async function ContentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { isEnabled } = await draftMode();
  const draft = isEnabled || (await headers()).get("x-kg-json") === "1";

  const cms = await getCmsPage(slug, draft);
  if (cms) {
    const pageKind = (cms as { page_kind?: string }).page_kind ?? "custom";

    // The page's own authored tree (custom pages converted to the Site Builder).
    const ownTree = (cms as { node_tree?: unknown }).node_tree as NodeTree | null;

    // ═══ Which design this page renders — the rule lives in one pure module
    // (lib/content-page-tree.ts) with its own tests. In short: a page's OWN
    // published tree always wins, policy pages included, because publishing is
    // the only thing that reaches the storefront and it is a person's deliberate
    // act. The SHARED policy layout — one template EVERY policy page is drawn
    // through — still waits for node_policy_template_enabled, since switching it
    // on restyles the whole set at once (card BNtsJACK). ═══
    const choice = chooseContentPageTree({
      pageKind,
      hasOwnTree: Boolean(ownTree),
      policyLayoutEnabled:
        pageKind === "policy" && !ownTree
          ? Boolean(await getFeatureFlag("node_policy_template_enabled"))
          : false,
      draft,
    });
    let tree: NodeTree | null = null;
    const treeKind = choice.kind;
    if (choice.source === "page") {
      tree = ownTree;
    } else if (choice.source === "policy_layout") {
      const layout = (await getCmsTemplate("policy_layout", draft).catch(() => null)) as {
        node_tree?: unknown;
      } | null;
      tree = (layout?.node_tree as NodeTree | null) ?? null;
    }

    // ═══ The financier's own logo on its own application page (card
    // XlDVUsuC). `/silverchef/apply` and `/skope-funding/apply` resolve here
    // once their CMS page is published — which all four live pages are — so
    // the masthead is placed at render time rather than written into a stored
    // tree staff own. The funder comes from the SLUG, so a page can never wear
    // the other financier's mark, and an author who places the logo themselves
    // keeps their placement (see the module). ═══
    const applyFunder = financeApplyFunderForSlug(slug);
    if (tree && applyFunder) tree = withFinanceApplyLogo(tree, applyFunder);

    // ═══ Site Builder node-tree path — renders through the shared BuilderTree
    // with the portal-compiled builder CSS for authored classes. The payload is
    // built by the SHARED composer (same one the designer samples with). ═══
    if (tree) {
      // Declared product / blog lists (WP2-a/o, site policy): loaded in one batch with the
      // viewer's visibility and prices; each list master gets `items` bound to its list.
      const listDecls = siteRenderPolicy.pageLists ? collectPageLists(tree) : [];
      const pageLists = listDecls.length ? await loadPageLists(listDecls) : null;
      if (pageLists) tree = bindPageLists(tree, listDecls);
      // Registered asset sizes for dimensionless static images (WP2-e, site policy): reserved
      // space, and the original width that caps the hi-DPI srcset.
      if (siteRenderPolicy.registeredImageDims) {
        const urls = collectStaticImageUrls(tree);
        const dims = urls.length ? await getAssetDims(urls).catch(() => ({}) as Record<string, { width: number; height: number }>) : {};
        tree = applyRegisteredImageDims(tree, new Map(Object.entries(dims)));
      }
      const listContext = pageLists
        ? await (async () => {
            const [pricesIncludeTax, cookieStore, memberPricingAvailable] = await Promise.all([
              getFeatureFlag("prices_include_tax").catch(() => false),
              cookies(),
              getFeatureFlag("member_pricing_enabled").catch(() => false),
            ]);
            return {
              lists: pageLists.lists,
              pricing: pageLists.pricing,
              gst: { inclusive: parseGstInclusive(cookieStore.get(GST_COOKIE)?.value), pricesIncludeTax: !!pricesIncludeTax },
              memberPricingAvailable: !!memberPricingAvailable,
              listing: listingForPageLists(listDecls),
            };
          })()
        : null;
      const contentBlock = (cms.blocks as Array<{ block_type: string; props?: Record<string, unknown> }>)?.find(
        (b) => b.block_type === "content_page"
      );
      const legacyPage = await getContentPage(slug).catch(() => null);
      const memberCtx = await getMemberContext().catch(() => null);
      const payload = composeContentPagePayload({
        channelId: CHANNEL_ID,
        slug,
        title: cms.title,
        kind: treeKind,
        blockProps: contentBlock?.props ?? null,
        legacyPage: (legacyPage as Record<string, unknown> | null) ?? null,
        customer: {
          isMember: memberCtx?.isMember ?? false,
          loggedIn: memberCtx?.loggedIn ?? false,
        },
        draft,
        sanitizeHtml,
        // Today's date (storefront timezone) for {{context.now.*}}. Pages render
        // per request (root layout force-dynamic), so it is never stale.
        ...(siteRenderPolicy.contentNow ? { now: calendarNow() } : {}),
        ...(listContext ?? {}),
      });
      const namedStyles = await getNamedStyles().catch(() => ({}));
      const components = (await (draft ? getDraftComponents() : getComponents()).catch(() => ({}))) as Record<string, NodeTree>;
      const builderCssBlob = (await getChannelSetting("builder_published_css").catch(() => null)) as {
        css?: string;
        generated_at?: string;
      } | null;
      const builderCss = builderCssBlob?.css ?? "";
      // A draft may use classes the published sheet has not compiled yet: then
      // it gets the sheet its publish would produce (builder/draft-builder-css.ts).
      const draftCss = draft
        ? await draftBuilderCss({
            tree,
            components,
            namedStyles,
            inputs: (await getChannelSetting(BUILDER_CSS_INPUTS_SETTING_KEY).catch(() => null)) as BuilderCssInputs | null,
            publishedGeneratedAt: builderCssBlob?.generated_at ?? null,
          })
        : null;
      const allFunctions = await getEnabledCmsFunctions().catch(() => ({}) as Record<string, string>);
      // Only what this page can call (site policy) — none → no QuickJS sandbox.
      const jsFunctions = siteRenderPolicy.onlyUsedFunctions
        ? usedCmsFunctions(tree, components, allFunctions)
        : allFunctions;
      let callResults: Record<string, unknown> = {};
      if (Object.keys(jsFunctions).length > 0) {
        await loadJsSandbox(jsFunctions).catch(() => null);
        callResults = await computeCallResults(tree.root, jsFunctions, payload as object).catch(() => ({}));
      }
      const jsonLd = siteRenderPolicy.pageSeo ? pageJsonLdBlocks(pageSeoOf(cms), tree, components) : [];
      return (
        <>
          {jsonLd.length ? <PageJsonLd blocks={jsonLd} /> : null}
          {draftCss ? (
            <style href={draftCssId(draftCss)} precedence="kg-builder">
              {draftCss}
            </style>
          ) : (
            <BuilderCssLink css={builderCss} />
          )}
          <BuilderContentPage
            tree={tree}
            payload={payload}
            namedStyles={namedStyles}
            components={usedComponents(tree, components)}
            jsFunctions={jsFunctions}
            callResults={callResults}
            draft={draft}
          />
        </>
      );
    }
    // No wrapper — blocks bring their own layout (the content_page block is a full
    // <article>), so a migrated page renders pixel-identically to the legacy path.
    const blockJsonLd = siteRenderPolicy.pageSeo ? pageJsonLdBlocks(pageSeoOf(cms), null) : [];
    return (
      <>
        {blockJsonLd.length ? <PageJsonLd blocks={blockJsonLd} /> : null}
        <BlockRenderer blocks={cms.blocks as unknown as RenderedBlock[]} draft={draft} />
      </>
    );
  }

  const page = await getContentPage(slug);
  if (!page) {
    // A renamed content page, or a legacy Zoey address that used to be one,
    // redirects rather than bare-404ing. (card EVvRDnZt)
    await redirectIfMapped(`/pages/${slug}`);
    notFound();
  }

  return (
    <article className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      <h1 className="heading-serif text-3xl sm:text-4xl text-text-primary mb-4">
        {page.heading || page.title}
      </h1>
      {page.summary && (
        <p className="text-base text-text-secondary leading-relaxed mb-8">{page.summary}</p>
      )}
      <RichContent html={page.body_html} stripStyles className="content-prose" />
      {page.updated && (
        <p className="mt-12 caption">Last updated: {page.updated}</p>
      )}
    </article>
  );
}
