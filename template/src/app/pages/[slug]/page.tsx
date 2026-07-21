import { notFound } from "next/navigation";
import { draftMode, headers } from "next/headers";
import type { Metadata } from "next";
import { getContentPage, getCmsPage } from "@/lib/store";
import { RichContent } from "@/components/content/RichContent";
import { BlockRenderer, type RenderedBlock } from "@/blocks/BlockRenderer";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { isEnabled } = await draftMode();
  const draft = isEnabled || (await headers()).get("x-kg-json") === "1";

  // Prefer the new CMS page; fall back to the legacy content_pages setting.
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
  const { isEnabled } = await draftMode();
  const draft = isEnabled || (await headers()).get("x-kg-json") === "1";

  // New CMS page (block-composed) takes precedence.
  const cms = await getCmsPage(slug, draft);
  if (cms) {
    // No wrapper — the content_page block is a full <article>, so a migrated page
    // renders pixel-identically to the legacy path.
    return <BlockRenderer blocks={cms.blocks as unknown as RenderedBlock[]} draft={draft} />;
  }

  // Legacy fallback — existing content_pages entries render unchanged until migrated.
  const page = await getContentPage(slug);
  if (!page) notFound();

  return (
    <article className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl sm:text-4xl font-bold text-zinc-900 mb-4">
        {page.heading || page.title}
      </h1>
      {page.summary && (
        <p className="text-base text-zinc-600 leading-relaxed mb-8">{page.summary}</p>
      )}
      <RichContent
        html={page.body_html}
        stripStyles
        className="prose prose-zinc max-w-none text-zinc-700 leading-relaxed"
      />
      {page.updated && (
        <p className="mt-12 text-xs text-zinc-400">Last updated: {page.updated}</p>
      )}
    </article>
  );
}
