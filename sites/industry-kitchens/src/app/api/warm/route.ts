import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getCategories, getCategoryListing } from "@/lib/store";

/**
 * Warms the faceted category-listing cache for every active category, in
 * process (direct store calls populate the exact unstable_cache entries the
 * category pages read — no self-HTTP, no extra deps). CI POSTs this after
 * every deploy because a new bundle changes every unstable_cache key (the
 * cached callback's source is part of the key), orphaning the persistent
 * cache volume's entries. Also handy after clearing the cache volume.
 *
 * Authenticated with the shared revalidate secret. Responds 202 immediately
 * and warms in the background; one run at a time per instance.
 */
const CONCURRENCY = 4;

let running = false;

export async function POST(req: NextRequest) {
  const secret = process.env.STOREFRONT_REVALIDATE_SECRET;
  if (!secret || req.headers.get("x-revalidate-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (running) {
    return NextResponse.json({ started: false, reason: "warm already running" }, { status: 409 });
  }
  running = true;

  after(async () => {
    const startedAt = Date.now();
    try {
      const categories = (await getCategories()) as { id: number }[];
      const queue = categories.map((c) => c.id);
      const total = queue.length;
      let warmed = 0;
      let failed = 0;
      await Promise.all(
        Array.from({ length: CONCURRENCY }, async () => {
          for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
            try {
              await getCategoryListing(id);
              warmed++;
            } catch {
              failed++;
            }
          }
        })
      );
      console.log(
        `[warm] category listings warmed: ${warmed}/${total} (${failed} failed) in ${Math.round((Date.now() - startedAt) / 1000)}s`
      );
    } catch (err) {
      console.error("[warm] run failed", err);
    } finally {
      running = false;
    }
  });

  return NextResponse.json({ started: true }, { status: 202 });
}
