import { notFound } from "next/navigation";
import { draftMode } from "next/headers";
import type { Metadata } from "next";
import { getContentPage, getCmsPage, getNamedStyles, getComponents, getChannelSetting, CHANNEL_ID } from "@/lib/store";
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
    // ═══ Site Builder node-tree path — a page authored in the node designer
    // renders through the shared BuilderTree (same model as the product
    // template), with the portal-compiled builder CSS for authored classes. ═══
    const nodeTree = (cms as { node_tree?: unknown }).node_tree as NodeTree | null;
    if (nodeTree) {
      const namedStyles = await getNamedStyles().catch(() => ({}));
      const components = (await getComponents().catch(() => ({}))) as Record<string, NodeTree>;
      const builderCss =
        ((await getChannelSetting("builder_published_css").catch(() => null)) as { css?: string } | null)?.css ?? "";
      const jsFunctions = await cmsFunctionService.enabledMapForChannel(CHANNEL_ID).catch(() => ({}) as Record<string, string>);
      let callResults: Record<string, unknown> = {};
      const pagePayload = { slug, title: cms.title };
      if (Object.keys(jsFunctions).length > 0) {
        await loadJsSandbox(jsFunctions).catch(() => null);
        callResults = await computeCallResults(nodeTree.root, jsFunctions, { page: pagePayload }).catch(() => ({}));
      }
      return (
        <>
          {builderCss && <style id="kg-builder-css" dangerouslySetInnerHTML={{ __html: builderCss }} />}
          <BuilderContentPage
            tree={nodeTree}
            page={pagePayload}
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
