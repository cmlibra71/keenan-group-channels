import type { MetadataRoute } from "next";
import * as store from "@/lib/store";
import {
  getSiteConfig,
  getCategories,
  getBrandsForChannel,
  getContentPages,
  getSitemapProducts,
} from "@/lib/store";
import { isIndexable, siteBaseUrl } from "@/lib/seo";

// Generated at request time — the catalog lives in the commerce DB, which is
// not reachable at build, and the contents change as products are updated.
export const dynamic = "force-dynamic";

// A single sitemap file is capped by the protocol at 50,000 URLs / 50MB. Both
// channel catalogues sit well under this today (~38–40k URLs); we page the
// product query in batches and truncate at the limit rather than emit an
// invalid oversized file. If a catalogue grows past this, split into a sitemap
// index (Next's generateSitemaps serves /sitemap/[id].xml but does NOT emit the
// /sitemap.xml index, so that needs a dedicated index route).
const MAX_URLS = 50_000;
const BATCH = 10_000;

// Blog is optional — some channels (e.g. Chef's Depot) ship no blog route.
type BlogPost = { slug: string; updatedAt?: Date | null; publishedAt?: Date | null };
async function getBlogRoutes(base: string): Promise<MetadataRoute.Sitemap> {
  const getBlogPosts = (store as Record<string, unknown>).getBlogPosts as
    | ((opts: { limit?: number }) => Promise<{ posts?: BlogPost[] }>)
    | undefined;
  if (typeof getBlogPosts !== "function") return [];
  const blog = await getBlogPosts({ limit: 1000 });
  const posts = blog?.posts ?? [];
  return [
    { url: `${base}/blog`, changeFrequency: "weekly", priority: 0.5 },
    ...posts.map((post) => ({
      url: `${base}/blog/${encodeURIComponent(post.slug)}`,
      lastModified: post.updatedAt ?? post.publishedAt ?? undefined,
      changeFrequency: "monthly" as const,
      priority: 0.4,
    })),
  ];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Noindex sites (e.g. the Industry Kitchens build mirror) expose an empty
  // sitemap rather than leaking the full catalogue.
  if (!isIndexable()) return [];

  const { site } = await getSiteConfig();
  const base = siteBaseUrl(site?.url);

  const [categories, brands, contentPages, blogRoutes] = await Promise.all([
    getCategories(),
    getBrandsForChannel(),
    getContentPages(),
    getBlogRoutes(base),
  ]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/products`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/categories`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/brands`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/clearance`, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/membership`, changeFrequency: "monthly", priority: 0.6 },
  ];

  const categoryRoutes: MetadataRoute.Sitemap = categories.map((c: { slug: string }) => ({
    url: `${base}/categories/${encodeURIComponent(c.slug)}`,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  const brandRoutes: MetadataRoute.Sitemap = brands.map((b: { slug: string }) => ({
    url: `${base}/brands/${encodeURIComponent(b.slug)}`,
    changeFrequency: "weekly",
    priority: 0.5,
  }));

  const pageRoutes: MetadataRoute.Sitemap = Object.keys(contentPages).map((slug) => ({
    url: `${base}/pages/${encodeURIComponent(slug)}`,
    changeFrequency: "monthly",
    priority: 0.3,
  }));

  const nonProduct = [...staticRoutes, ...categoryRoutes, ...brandRoutes, ...pageRoutes, ...blogRoutes];

  // Page through the visible catalogue up to the remaining URL budget.
  const productBudget = Math.max(0, MAX_URLS - nonProduct.length);
  const productRoutes: MetadataRoute.Sitemap = [];
  for (let offset = 0; offset < productBudget; offset += BATCH) {
    const limit = Math.min(BATCH, productBudget - offset);
    const rows = await getSitemapProducts(offset, limit);
    if (rows.length === 0) break;
    for (const p of rows) {
      productRoutes.push({
        url: `${base}/products/${encodeURIComponent(p.slug)}`,
        lastModified: p.updatedAt ?? undefined,
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }
    if (rows.length < limit) break;
  }

  if (productRoutes.length >= productBudget) {
    console.warn(
      `[sitemap] product URLs hit the ${MAX_URLS}-URL limit — split into a sitemap index.`
    );
  }

  return [...nonProduct, ...productRoutes];
}
