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
  const purge = (tag: string) => revalidateTag(tag, { expire: 0 });
  // Soft purge: entries are marked stale and served stale-while-revalidating,
  // so views stay instant. Used for the faceted category-listing caches, where
  // a hard purge would make the first visitor pay the full query cost.
  const purgeSoft = (tag: string) => revalidateTag(tag, "max");

  // Bulk catalog change (Zoey ingestor's storefront_revalidate node): refresh
  // everything channel-scoped in the background, hard-evict nothing — ingest
  // runs are frequent and a hard broad purge would defeat the caching.
  if (kind === "catalog") {
    purgeSoft(`channel-${channelId}`);
    purgeSoft(`channel-${channelId}-catalog`);
    return NextResponse.json({ revalidated: true });
  }

  // Broad bust (covers nav/settings reads), then the page-specific tag.
  purge(`channel-${channelId}`);
  purge("cms-pages");
  if (kind === "home") purge(`channel-${channelId}-home`);
  else if (kind === "custom" && slug) purge(`channel-${channelId}-page-${slug}`);
  else if (kind === "category" && typeof categoryId === "number") {
    purge(`channel-${channelId}-category-${categoryId}`);
    // Precise bust so an admin's category edit is fresh on the very next view.
    purge(`category-listing-${channelId}-${categoryId}`);
  } else if (kind === "blog_index") purge("blog");
  else if (kind === "tokens") purge(`channel-${channelId}-design-tokens`);
  else if (kind === "product" || kind === "category_layout")
    purge(`channel-${channelId}-template-${kind}`);

  // Any catalog-affecting kind also refreshes the cached category listings
  // (they deliberately don't carry the broad channel tag).
  if (kind === "product" || kind === "category" || kind === "category_layout")
    purgeSoft(`channel-${channelId}-catalog`);

  return NextResponse.json({ revalidated: true });
}
