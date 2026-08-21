import { NextRequest, NextResponse } from "next/server";
import { searchProducts } from "@keenan/services/search";
import { shouldSuppressCatalogSalePrice } from "@/lib/store";
import { CHANNEL_ID } from "@/lib/channel";
import { applyCatalogScope } from "@/lib/catalog-scope";
import { parsePublicSearchParams } from "@/lib/search-params";

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
 * Keep in step with the `SuggestionHit` interface in
 * `components/search/use-search-suggestions.ts`, the only consumer.
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
  // Every parameter is clamped or allowlisted — see lib/search-params.ts for
  // why `filter` no longer exists at all.
  const { q, limit, offset, sort, facets, tooShort } = parsePublicSearchParams(
    request.nextUrl.searchParams
  );

  if (tooShort) {
    return NextResponse.json({
      hits: [],
      query: q,
      estimatedTotalHits: 0,
      offset,
      consumed: 0,
    });
  }

  try {
    const result = await searchProducts(CHANNEL_ID, q, {
      limit,
      offset,
      sort,
      facets,
    });

    // Result POSITIONS this window consumed, taken BEFORE catalogue scope drops
    // anything. The suggestion dropdown pages on this, never on hits returned:
    // scope is applied below, so a 40-row window can legitimately answer with 37
    // hits, and paging on 37 would re-request the 3 that were just skipped.
    // (`lib/search-suggestions.ts` owns that arithmetic; same rule as /search.)
    const consumed = result.hits.length;

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

    // Hits are viewer-scoped by applyCatalogScope above, so this response is
    // PER-USER and must never be stored in a shared cache. Do not "optimise"
    // this into a public max-age.
    return NextResponse.json(
      { ...result, offset, consumed },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    // Meilisearch unavailable — return empty results with 503
    return NextResponse.json(
      {
        hits: [],
        query: q,
        estimatedTotalHits: 0,
        offset,
        consumed: 0,
        error: "Search temporarily unavailable",
      },
      { status: 503 }
    );
  }
}
