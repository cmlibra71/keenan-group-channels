import { notFound } from "next/navigation";
import { draftMode } from "next/headers";
import type { Metadata } from "next";
import { getContentPage, getCmsPage, getCmsTemplate, getFeatureFlag, getNamedStyles, getComponents, getChannelSetting, CHANNEL_ID } from "@/lib/store";
import { getMemberContext } from "@/lib/member";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { composeContentPagePayload } from "@keenan/services/builder";
import { RichContent } from "@/components/content/RichContent";
import { BlockRenderer, type RenderedBlock } from "@/blocks/BlockRenderer";
import { BuilderContentPage } from "@/builder/BuilderContentPage";
import { cmsFunctionService } from "@keenan/services/services";
import { loadJsSandbox, computeCallResults, type NodeTree } from "@keenan/services/builder";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { isEnabled: draft } = await draftMode();

  const cms = await getCmsPage(slug, draft);
  if (cms) {
    const meta = cms.page_meta as { meta_title?: string; meta_description?: string };
    return {
      title: meta.meta_title || cms.meta_title || cms.title,
      description: meta.meta_description || cms.meta_description || undefined,
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
  const { isEnabled: draft } = await draftMode();

  const cms = await getCmsPage(slug, draft);
  if (cms) {
    const pageKind = (cms as { page_kind?: string }).page_kind ?? "custom";

    // The page's own authored tree (custom pages converted to the Site Builder).
    const ownTree = (cms as { node_tree?: unknown }).node_tree as NodeTree | null;

    // ═══ Shared POLICY LAYOUT — 'policy' pages (terms, privacy, returns,
    // shipping, contact, warranty) render through ONE node template; the page
    // supplies the data ({{page.heading}}, {{page.body_html}}…). Edit the
    // template once → every policy page updates. Gated: flag for live, or
    // draft mode when an authored layout draft exists. ═══
    let tree: NodeTree | null = null;
    let treeKind: "policy" | "custom" = "custom";
    if (pageKind === "policy") {
      const flag = await getFeatureFlag("node_policy_template_enabled");
      if (flag || draft) {
        if (ownTree) {
          tree = ownTree;
          treeKind = "policy";
        } else {
          const layout = (await getCmsTemplate("policy_layout", draft).catch(() => null)) as {
            node_tree?: unknown;
          } | null;
          const layoutTree = (layout?.node_tree as NodeTree | null) ?? null;
          if (layoutTree) {
            tree = layoutTree;
            treeKind = "policy";
          }
        }
      }
    } else if (ownTree) {
      tree = ownTree;
    }

    // ═══ Site Builder node-tree path — renders through the shared BuilderTree
    // with the portal-compiled builder CSS for authored classes. The payload is
    // built by the SHARED composer (same one the designer samples with). ═══
    if (tree) {
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
          loggedIn: (memberCtx?.accountId ?? null) != null || (memberCtx?.isMember ?? false),
        },
        draft,
        sanitizeHtml,
      });
      const namedStyles = await getNamedStyles().catch(() => ({}));
      const components = (await getComponents().catch(() => ({}))) as Record<string, NodeTree>;
      const builderCss =
        ((await getChannelSetting("builder_published_css").catch(() => null)) as { css?: string } | null)?.css ?? "";
      const jsFunctions = await cmsFunctionService.enabledMapForChannel(CHANNEL_ID).catch(() => ({}) as Record<string, string>);
      let callResults: Record<string, unknown> = {};
      if (Object.keys(jsFunctions).length > 0) {
        await loadJsSandbox(jsFunctions).catch(() => null);
        callResults = await computeCallResults(tree.root, jsFunctions, payload as object).catch(() => ({}));
      }
      return (
        <>
          {builderCss && <style id="kg-builder-css" dangerouslySetInnerHTML={{ __html: builderCss }} />}
          <BuilderContentPage
            tree={tree}
            payload={payload}
            namedStyles={namedStyles}
            components={components}
            jsFunctions={jsFunctions}
            callResults={callResults}
            draft={draft}
          />
        </>
      );
    }
    // No wrapper — blocks bring their own layout (the content_page block is a full
    // <article>), so a migrated page renders pixel-identically to the legacy path.
    return <BlockRenderer blocks={cms.blocks as unknown as RenderedBlock[]} draft={draft} />;
  }

  const page = await getContentPage(slug);
  if (!page) notFound();

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
