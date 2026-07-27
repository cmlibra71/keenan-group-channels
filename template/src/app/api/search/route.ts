import { NextRequest, NextResponse } from "next/server";
import { searchProducts } from "@keenan/services/search";
import { shouldSuppressCatalogSalePrice } from "@/lib/store";
import { CHANNEL_ID } from "@/lib/channel";
import { applyCatalogScope } from "@/lib/catalog-scope";

/**
 * Fields this PUBLIC endpoint may serialise, as an ALLOWLIST.
 *
 * The Meilisearch product document carries `costPrice` (see the services package,
 * `src/search/meilisearch.ts`), the index sets no `displayedAttributes`, and
 * `searchProducts()` sets no `attributesToRetrieve` — so the raw hit is the whole
 * document. Returning it verbatim published our buy price to anyone who could type
 * a URL, and on a cost-plus channel the cost IS the member price.
 *
 * An allowlist, not a blocklist: a field added to the index later must be opted in
 * here deliberately rather than start leaking on its own. Fixed here (the storefront
 * boundary) rather than on the shared index or in `searchProducts()`, because the
 * admin dashboard legitimately reads `costPrice` from the warehouse index.
 *
 * Keep in step with the `SearchHit` interface in `components/search/SearchTypeahead.tsx`,
 * the only consumer.
 */
const PUBLIC_HIT_FIELDS = [
  "id",
  "name",
  "sku",
  "urlPath",
  "price",
  "salePrice",
  "brandName",
  "brandId",
  "categoryNames",
  "categoryIds",
  "thumbnailUrl",
  "isOnSale",
  "isFeatured",
  "type",
  "_formatted",
] as const;

function pick(src: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of PUBLIC_HIT_FIELDS) {
    if (key in src) out[key] = src[key];
  }
  return out;
}

function toPublicHit(hit: unknown): Record<string, unknown> {
  const out = pick(hit as Record<string, unknown>);
  // `_formatted` is Meilisearch's highlighted MIRROR of the whole document — it
  // carries every attribute again, costPrice included. Filter it with the same
  // allowlist or the narrowing above is defeated by its own copy.
  if (out._formatted && typeof out._formatted === "object") {
    out._formatted = pick(out._formatted as Record<string, unknown>);
  }
  return out;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const q = searchParams.get("q")?.trim() || "";
  const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 100);
  const offset = parseInt(searchParams.get("offset") || "0", 10);
  const filter = searchParams.get("filter") || undefined;
  const sort = searchParams.get("sort")?.split(",").filter(Boolean) || undefined;
  const facets = searchParams.get("facets")?.split(",").filter(Boolean) || undefined;

  if (!q) {
    return NextResponse.json({ hits: [], query: "", estimatedTotalHits: 0 });
  }

  try {
    const result = await searchProducts(CHANNEL_ID, q, {
      limit,
      offset,
      filter,
      sort,
      facets,
    });

    // L2 — the Meilisearch index is SHARED by every shopper and cannot encode per-account
    // visibility, so the viewer's scope is applied HERE, to the hits already returned by the index.
    // (estimatedTotalHits is the index's count and may over-count when a restricted product is
    // dropped — a count, never a leak: no restricted row is ever rendered.)
    const visible = await applyCatalogScope(result.hits as unknown as { id: number }[]);
    const dropped = result.hits.length - visible.length;
    if (dropped > 0) {
      result.hits = visible as unknown as typeof result.hits;
      result.estimatedTotalHits = Math.max(visible.length, result.estimatedTotalHits - dropped);
    }

    // Member-only pricing channels never expose the shared catalog sale price
    // (it's another channel's public price) — not even in search results.
    if (await shouldSuppressCatalogSalePrice()) {
      result.hits = result.hits.map((hit) =>
        "salePrice" in hit ? { ...hit, salePrice: null } : hit
      ) as typeof result.hits;
    }

    // Narrow to the public field set LAST, so nothing added above can widen it.
    result.hits = result.hits.map(toPublicHit) as unknown as typeof result.hits;

    return NextResponse.json(result);
  } catch {
    // Meilisearch unavailable — return empty results with 503
    return NextResponse.json(
      { hits: [], query: q, estimatedTotalHits: 0, error: "Search temporarily unavailable" },
      { status: 503 }
    );
  }
}
