import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { getBlogPosts, getBlogTags } from "@/lib/store";

export const metadata: Metadata = {
  title: "Blog",
  description: "Latest news, buying guides, and industry insights.",
};

export default async function BlogIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; tag?: string }>;
}) {
  const sp = await searchParams;
  const page = Number(sp.page ?? "1");
  const tag = sp.tag;
  const [{ posts, pagination }, tags] = await Promise.all([
    getBlogPosts({ page, limit: 12, tag }),
    getBlogTags(),
  ]);
  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.limit));

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
      <header className="mb-10">
        <h1 className="text-3xl sm:text-4xl font-bold text-zinc-900">Blog</h1>
        <p className="mt-2 text-zinc-600">
          {tag ? `Posts tagged ${tag}` : "Latest news, buying guides, and industry insights."}
        </p>
        {tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/blog"
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                !tag
                  ? "bg-zinc-900 text-white border-zinc-900"
                  : "bg-white text-zinc-700 border-zinc-300 hover:border-zinc-500"
              }`}
            >
              All
            </Link>
            {tags.map((t: { tag: string; count: number }) => (
              <Link
                key={t.tag}
                href={`/blog?tag=${encodeURIComponent(t.tag)}`}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  tag === t.tag
                    ? "bg-zinc-900 text-white border-zinc-900"
                    : "bg-white text-zinc-700 border-zinc-300 hover:border-zinc-500"
                }`}
              >
                {t.tag} ({t.count})
              </Link>
            ))}
          </div>
        )}
      </header>

      {posts.length === 0 ? (
        <p className="text-zinc-500 text-center py-16">No posts yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {(posts as Array<{
            id: number;
            slug: string;
            title: string;
            excerpt: string | null;
            hero_image_url: string | null;
            hero_image_alt: string | null;
            author_name: string | null;
            published_at: string | Date | null;
            tags: string[] | null;
          }>).map((p) => (
            <Link
              key={p.id}
              href={`/blog/${p.slug}`}
              className="group rounded-xl overflow-hidden border border-zinc-200 bg-white hover:shadow-md transition-shadow"
            >
              <div className="relative aspect-[16/9] bg-zinc-100">
                {p.hero_image_url && (
                  <Image
                    src={p.hero_image_url}
                    alt={p.hero_image_alt || p.title}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                )}
              </div>
              <div className="p-5">
                <h2 className="text-lg font-semibold text-zinc-900 group-hover:text-amber-700 transition-colors line-clamp-2">
                  {p.title}
                </h2>
                {p.excerpt && (
                  <p className="mt-2 text-sm text-zinc-600 line-clamp-3">{p.excerpt}</p>
                )}
                <div className="mt-4 flex items-center justify-between text-xs text-zinc-500">
                  <span>{p.author_name ?? "Industry Kitchens"}</span>
                  {p.published_at && (
                    <time dateTime={String(p.published_at)}>
                      {new Date(p.published_at).toLocaleDateString("en-AU", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </time>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <nav className="mt-12 flex items-center justify-center gap-2">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
            <Link
              key={n}
              href={`/blog?${tag ? `tag=${encodeURIComponent(tag)}&` : ""}page=${n}`}
              className={`px-3 py-1 rounded text-sm font-medium ${
                n === page
                  ? "bg-zinc-900 text-white"
                  : "bg-white text-zinc-700 border border-zinc-200 hover:border-zinc-500"
              }`}
            >
              {n}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
