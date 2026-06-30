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

  // Broad bust (covers nav/settings reads), then the page-specific tag.
  purge(`channel-${channelId}`);
  purge("cms-pages");
  if (kind === "home") purge(`channel-${channelId}-home`);
  else if (kind === "custom" && slug) purge(`channel-${channelId}-page-${slug}`);
  else if (kind === "category" && typeof categoryId === "number")
    purge(`channel-${channelId}-category-${categoryId}`);
  else if (kind === "blog_index") purge("blog");

  return NextResponse.json({ revalidated: true });
}
