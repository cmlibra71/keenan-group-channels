import { notFound } from "next/navigation";
import { draftMode } from "next/headers";
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
    return (
      <div className="py-4">
        <BlockRenderer blocks={cms.blocks as unknown as RenderedBlock[]} draft={draft} />
      </div>
    );
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
