import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getContentPage } from "@/lib/store";
import { RichContent } from "@/components/content/RichContent";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
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
        className="ik-prose"
      />
      {page.updated && (
        <p className="mt-12 text-xs text-zinc-400">Last updated: {page.updated}</p>
      )}
    </article>
  );
}
