import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";
import { getBlogPostBySlug } from "@/lib/store";
import { RichContent } from "@/components/content/RichContent";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = (await getBlogPostBySlug(slug)) as {
    title: string;
    page_title?: string | null;
    meta_description?: string | null;
    excerpt?: string | null;
    hero_image_url?: string | null;
  } | null;
  if (!post) return {};
  return {
    title: post.page_title || post.title,
    description: post.meta_description || post.excerpt || undefined,
    openGraph: post.hero_image_url ? { images: [post.hero_image_url] } : undefined,
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = (await getBlogPostBySlug(slug)) as {
    id: number;
    slug: string;
    title: string;
    excerpt: string | null;
    body_html: string;
    hero_image_url: string | null;
    hero_image_alt: string | null;
    author_name: string | null;
    author_avatar_url: string | null;
    tags: string[] | null;
    published_at: string | Date | null;
  } | null;

  if (!post) notFound();

  return (
    <article className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12">
      <nav className="flex items-center gap-1.5 text-sm text-zinc-400 mb-6">
        <Link href="/blog" className="hover:text-zinc-600">Blog</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-zinc-700 truncate">{post.title}</span>
      </nav>

      <header className="mb-8">
        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {post.tags.map((t) => (
              <Link
                key={t}
                href={`/blog?tag=${encodeURIComponent(t)}`}
                className="text-xs font-bold uppercase tracking-wide text-[#D94B2B] hover:text-[#C73629]"
              >
                {t}
              </Link>
            ))}
          </div>
        )}
        <h1 className="text-3xl sm:text-4xl font-bold text-zinc-900">{post.title}</h1>
        <div className="mt-3 flex items-center gap-3 text-sm text-zinc-500">
          {post.author_avatar_url && (
            <Image
              src={post.author_avatar_url}
              alt={post.author_name ?? "Author"}
              width={28}
              height={28}
              className="rounded-full"
            />
          )}
          {post.author_name && <span>{post.author_name}</span>}
          {post.published_at && (
            <>
              {post.author_name && <span>·</span>}
              <time dateTime={String(post.published_at)}>
                {new Date(post.published_at).toLocaleDateString("en-AU", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </time>
            </>
          )}
        </div>
      </header>

      {post.hero_image_url && (
        <div className="relative aspect-[16/9] rounded-xl overflow-hidden bg-zinc-100 mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.hero_image_url}
            alt={post.hero_image_alt || post.title}
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>
      )}

      {post.excerpt && (
        <p className="text-lg text-zinc-700 leading-relaxed mb-8 font-medium">{post.excerpt}</p>
      )}

      <RichContent html={post.body_html} stripStyles className="ik-article" />
    </article>
  );
}
