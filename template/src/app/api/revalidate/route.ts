import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

/**
 * Cache-busting webhook called by the portal after a CMS publish/rollback.
 * Authenticated with a shared secret (STOREFRONT_REVALIDATE_SECRET). Reuses the
 * cache tags the channel store already attaches (`channel-${id}`, page-specific).
 */
export async function POST(req: NextRequest) {
  const secret = process.env.STOREFRONT_REVALIDATE_SECRET;
  if (!secret || req.headers.get("x-revalidate-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    channelId?: number;
    kind?: string;
    slug?: string;
    categoryId?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const { channelId, kind, slug, categoryId } = body;
  if (typeof channelId !== "number") {
    return NextResponse.json({ error: "channelId required" }, { status: 400 });
  }

  // Next 16: revalidateTag requires a cache-life profile; { expire: 0 } purges now.
  // NOTE: any tag revalidation of unstable_cache entries is a HARD expiry on
  // this Next version (SWR profiles only apply to `use cache` entries), so the
  // faceted category-listing caches (tag `category-listing-*` / the
  // `channel-${id}-catalog` ops lever) are deliberately NOT purged on bulk
  // kinds — they refresh via their own 300s stale-while-revalidate window, so
  // views stay instant no matter how often the catalog churns.
  const purge = (tag: string) => revalidateTag(tag, { expire: 0 });

  // Broad bust (covers nav/settings reads), then the page-specific tag.
  // kind "catalog" (the Zoey ingestor's storefront_revalidate node) is just
  // the broad bust: nav / category tree / product pages pick up ingest writes
  // immediately; category listings follow within their SWR window.
  purge(`channel-${channelId}`);
  purge("cms-pages");
  if (kind === "home") purge(`channel-${channelId}-home`);
  else if (kind === "custom" && slug) purge(`channel-${channelId}-page-${slug}`);
  else if (kind === "category" && typeof categoryId === "number") {
    purge(`channel-${channelId}-category-${categoryId}`);
    // Precise bust so an admin's category edit is fresh on the very next view
    // (one recompute of that category's listing variants — low volume).
    purge(`category-listing-${channelId}-${categoryId}`);
  } else if (kind === "blog_index") purge("blog");
  else if (kind === "tokens") purge(`channel-${channelId}-design-tokens`);
  else if (kind === "product" || kind === "category_layout")
    purge(`channel-${channelId}-template-${kind}`);

  return NextResponse.json({ revalidated: true });
}
